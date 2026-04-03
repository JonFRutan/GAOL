import { useState, useEffect, useRef } from 'react';
//importing all the necessary modals, panels, and hooks
import useTTS from '../../hooks/useTTS.js';
import NavPanel from './panels/NavPanel.jsx';
import ChatPanel from './panels/ChatPanel.jsx';
import PartyGrid from './panels/PartyGrid.jsx';
import CharacterSheet from './sheets/CharacterSheet.jsx';
import WorldSheet from './sheets/WorldSheet.jsx';
import VoiceModal from './modals/VoiceModal.jsx';
import ModelModal from './modals/ModelModal.jsx';
import OverrideModal from './modals/OverrideModal.jsx';
import KeyModal from './modals/KeyModal.jsx';
import PromoteModal from './modals/PromoteModal.jsx';
import KickModal from './modals/KickModal.jsx';
import './GameScreen.css';

export default function GameScreen({ auth, setAuth, ui, setUi, socket, gameData, setGameData, onExit }) {
  const { messages, party, worldData, isEmbarking, isFinale, lastRoll, currentModel } = gameData;
  //local ui state
  const [activeTab, setActiveTab] = useState('character');
  const [worldTab, setWorldTab] = useState('history');
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [actionInput, setActionInput] = useState('');
  const [particles, setParticles] = useState([]);
  //modal target
  const [modalTarget, setModalTarget] = useState('');
  const [revokeKeyOnPromote, setRevokeKeyOnPromote] = useState(false);
  //character form (not sheet)
  const [playerForm, setPlayerForm] = useState({
    description: '', tags: '', ambition: 'Unknown', secret: ''
  });
  const [formSynced, setFormSynced] = useState(false);
  //TTS settings
  const tts = useTTS(); //is it enabled?
  const chatEndRef = useRef(null);
  //derived state
  //users stats
  const myStats = party.find(p => p.name === auth.username) || {
    name: auth.username, hp: 100, status: 'Alive', description: '', tags: [], ambition: '', secret: '', is_ready: false
  };
  const nonSystemMessages = messages.filter(m => m.sender !== 'System');          //messages sent by players
  const isGameActive = nonSystemMessages.length > 0;                              //game is active if player messages are there, they can't be sent until game start
  const isLockedIn = myStats.is_ready || isGameActive;                            //is the player ready, or is the game already active
  const displayedPlayer = party.find(p => p.name === selectedPlayer) || myStats;  //whos character is currently displayed on the bottom right character sheet
  const isOwnSheet = displayedPlayer.name === auth.username;                      //is the player looking at their own sheet (for visual differentiation)
  const allPlayersReady = party.length > 0 && party.every(p => p.is_ready);       //is everyone ready?
  //default selected sheet should be the users
  useEffect(() => {
    if (auth.username && !selectedPlayer) setSelectedPlayer(auth.username);
  }, [auth.username, selectedPlayer]);
  //scoll down the chat window to the most recent message
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);
  //sync form with server data - on ai update, refresh, reconnect
  useEffect(() => {
    if (!formSynced && (myStats.is_ready || (myStats.description && myStats.description.length > 0))) {
      setPlayerForm({
        description: myStats.description || '',
        tags: myStats.tags?.join(', ') || '',
        ambition: myStats.ambition || 'Unknown',
        secret: myStats.secret || ''
      });
      setFormSynced(true);
    }
  }, [myStats.is_ready, myStats.description]); //refreshed when myStats.is_ready or myStats.description is updated as well

  //TTS on sent GAOL messages
  useEffect(() => {
    if (!tts.enabled || messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (last.sender === 'GAOL') tts.playTTS(last.text);
  }, [messages, tts.enabled]);
  //handlers
  const setOverlay = (mode) => setUi(prev => ({ ...prev, overlayMode: mode }));
  //begin the game
  //emits an embark event to the server to let the server know the game has begun.
  const handleEmbark = (e) => {
    setGameData(prev => ({ ...prev, isEmbarking: true }));
    //particle explosion
    const rect = e.target.getBoundingClientRect();
    const newParticles = Array.from({ length: 30 }, (_, i) => {
      const angle = Math.random() * Math.PI * 2;
      const velocity = 50 + Math.random() * 100;
      return {
        id: Date.now() + i,
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
        tx: Math.cos(angle) * velocity + 'px',
        ty: Math.sin(angle) * velocity + 'px'
      };
    });
    setParticles(newParticles);
    setTimeout(() => setParticles([]), 1000);
    socket.emit('embark', { room: auth.room });
  };

  //if the user leaves the room, a socket event is submitted letting the server know
  const handleLeave = () => {
    if (auth.room) socket.emit('leave_room', { room: auth.room });
    onExit({ msg: 'Disconnected.' });
  };

  //handle the end of the game. emits a finale event 
  const handleFinale = () => {
    setGameData(prev => ({ ...prev, isFinale: true }));
    socket.emit('finale', { room: auth.room });
  };

  //see if the player is prepared to "ready up"
  //they need to have <6 & >0 tags, and an ambition
  const handleReady = () => {
    if (isLockedIn) return;
    const tags = playerForm.tags.split(',').map(t => t.trim()).filter(t => t.length > 0);
    if (tags.length === 0) { setUi(prev => ({ ...prev, statusMsg: 'Define your character tags.' })); return; }
    if (tags.length > 5) { setUi(prev => ({ ...prev, statusMsg: 'Too many tags (Max 5).' })); return; }
    if (!playerForm.ambition.trim()) { setUi(prev => ({ ...prev, statusMsg: 'Define your ambition.' })); return; }
    //emits an event telling the server (and the room) that the user is ready
    socket.emit('player_ready', {
      room: auth.room,
      description: playerForm.description, //optional
      tags,
      ambition: playerForm.ambition,
      secret: playerForm.secret            //optional
    });
  };

  //when the user hits 'enter' and submits their turn
  const sendAction = () => {
    if (isFinale || !actionInput.trim()) return;
    const roll = Math.floor(Math.random() * 20) + 1;
    setGameData(prev => ({ ...prev, lastRoll: roll }));
    socket.emit('player_action', { username: auth.username, room: auth.room, message: actionInput, roll });
    setActionInput(''); 
  };

  //when the admin does a server override
  const sendOverride = (text) => {
    if (!text.trim()) return;
    socket.emit('submit_override', { room: auth.room, text });
    setOverlay(''); //get rid of modal
  };

  //when the admin changes the AI model being used
  const handleModelChange = (model) => {
    socket.emit('change_model', { room: auth.room, model });
    setGameData(prev => ({ ...prev, currentModel: model }));
    setOverlay(''); //get rid of modal
  };

  //changing / updating the API key for the rooms AI model
  const submitNewKey = (key) => {
    if (key.trim().length <= 10) { setUi(prev => ({ ...prev, statusMsg: 'Invalid Key Length.' })); return; }
    socket.emit('update_api_key', { room: auth.room, new_key: key });
    setOverlay(''); //get rid of modal
  };

  //double check that we want the player being kicked to be removed
  const confirmKick = () => {
    socket.emit('kick_player', { room: auth.room, target_name: modalTarget });
    setOverlay(''); //get rid of modal
  };

  //promote a player to become the new admin
  const submitPromote = () => {
    socket.emit('promote_player', { room: auth.room, target_name: modalTarget, revoke_key: revokeKeyOnPromote });
    setOverlay(''); //get rid of modal
  };

  //open the kick modal
  const openKick = (name, e) => { e.stopPropagation(); setModalTarget(name); setOverlay('kick'); };
  //open the promot modal
  const openPromote = (name, e) => { e.stopPropagation(); setModalTarget(name); setRevokeKeyOnPromote(false); setOverlay('promote'); };

  const showSheetPrompt = !isLockedIn && !isGameActive && activeTab === 'character' && isOwnSheet;

  //render
  return (
    <div className="main-layout">
      {/* Embark Particles */}
      {particles.map(p => (
        <div key={p.id} className="particle" style={{ left: p.x, top: p.y, '--tx': p.tx, '--ty': p.ty }} />
      ))}
      
      <NavPanel
        isAdmin={auth.isAdmin}
        tts={tts}
        onLeave={handleLeave}
        onFinale={handleFinale}
        setOverlay={setOverlay}
        overlayMode={ui.overlayMode}
      />

      <ChatPanel
        messages={messages}
        statusMsg={ui.statusMsg}
        worldName={worldData?.name || ''}
        isAdmin={auth.isAdmin}
        isEmbarking={isEmbarking}
        isFinale={isFinale}
        isLockedIn={isLockedIn}
        allPlayersReady={allPlayersReady}
        nonSystemMessages={nonSystemMessages}
        lastRoll={lastRoll}
        actionInput={actionInput}
        setActionInput={setActionInput}
        onEmbark={handleEmbark}
        onSendAction={sendAction}
        chatEndRef={chatEndRef}
      />

      <div className="right-panel">
        <PartyGrid
          party={party}
          selectedPlayer={selectedPlayer}
          username={auth.username}
          isAdmin={auth.isAdmin}
          nonSystemMessages={nonSystemMessages}
          onSelectPlayer={(name) => { setSelectedPlayer(name); setActiveTab('character'); }}
          onKick={openKick}
          onPromote={openPromote}
        />

        <div className="detail-view">
          <div className="tab-bar">
            <button className={`tab-btn ${activeTab === 'character' ? 'active' : ''}`} onClick={() => setActiveTab('character')}>
              CHARACTER SHEET
            </button>
            <button className={`tab-btn ${activeTab === 'world' ? 'active' : ''}`} onClick={() => setActiveTab('world')}>
              WORLD SHEET
            </button>
          </div>

          {activeTab === 'character' ? (
            <CharacterSheet
              displayedPlayer={displayedPlayer}
              isOwnSheet={isOwnSheet}
              isLockedIn={isLockedIn}
              showPrompt={showSheetPrompt}
              playerForm={playerForm}
              setPlayerForm={setPlayerForm}
              worldData={worldData}
              onReady={handleReady}
            />
          ) : (
            <WorldSheet worldData={worldData} worldTab={worldTab} setWorldTab={setWorldTab} />
          )}
        </div>
      </div>

      {/* modals */}
      {ui.overlayMode === 'voice' && (
        <VoiceModal tts={tts} onClose={() => setOverlay('')} />
      )}
      {ui.overlayMode === 'model' && (
        <ModelModal currentModel={currentModel} onChange={handleModelChange} onClose={() => setOverlay('')} />
      )}
      {ui.overlayMode === 'override' && (
        <OverrideModal onSubmit={sendOverride} onClose={() => setOverlay('')} />
      )}
      {ui.overlayMode === 'key' && (
        <KeyModal onSubmit={submitNewKey} onClose={() => setOverlay('')} />
      )}
      {ui.overlayMode === 'promote' && (
        <PromoteModal target={modalTarget} revokeKey={revokeKeyOnPromote} setRevokeKey={setRevokeKeyOnPromote} onSubmit={submitPromote} onClose={() => setOverlay('')} />
      )}
      {ui.overlayMode === 'kick' && (
        <KickModal target={modalTarget} onConfirm={confirmKick} onClose={() => setOverlay('')} />
      )}
    </div>
  );
}
