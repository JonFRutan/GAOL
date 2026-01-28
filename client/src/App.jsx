import { useState, useEffect, useRef } from 'react';
import { debugLog } from './hooks/logger.js'; //debugging logger
import LoginScreen from './components/Login/LoginScreen.jsx';
import GameScreen from './components/Game/GameScreen.jsx';
import SamJs from 'sam-js';
import io from 'socket.io-client';
import './App.css';

//connection to the flask backend, uses undefined for production relative path
const SOCKET_URL = import.meta.env.PROD ? undefined : 'http://localhost:5000';
const socket = io(SOCKET_URL);

function App() {
  //////////////////////////////////////
  //              CONSTANTS           //
  //////////////////////////////////////
  //store client data
  //including frontend display states

  //authentication / room connection
  const [auth, setAuth] = useState ({
    username: '',             //players username
    room: '',                 //room a player is in
    isAdmin: false,           //are you the admin of the room
    apiKey: '',               //api key for the current room 
    serverHasKey: null        //does the server have an api key
  });

  //ui state and active modals
  const [ui, setUi] = useState ({
    view: 'login',            //gamestate login / playing
    activeModal: null,        //show modal booleans
    statusMsg: '',            //status messages, e.g. "Disconnected"
    activeTab: 'character',   //Tab active in game, defaults to your player tab
    worldTab: 'history'       //active subtab within the world tab, defaults to the worlds history
  });


  //TO BE REMOVED
  //game data in an active session
  const [game, setGame] = useState({
    messages: [],             //messages in the game
    party: [],                //party members, stats, and statuses
    worldData: null,          //data of the loaded world, history, figures, etc.
    isReady: false,           //have you submitted your turn.
    isEmbarking: false,       //
    isFinale: false,
    lastRoll: null
  });

  //tracks if user is in 'login' screen or 'playing' the game
  const [gameState, setGameState] = useState('login'); 
  //basic user inputs for authentication
  const [username, setUsername] = useState('');
  const [room, setRoom] = useState('');
  const [pendingRoom, setPendingRoom] = useState(''); //stores room ID while waiting for password
  //list of available lobbies fetched from server
  const [activeRooms, setActiveRooms] = useState([]);
  //world tracking
  const [currentWorldName, setCurrentWorldName] = useState('');
  //stores full world object (lore, events, settings)
  const [worldData, setWorldData] = useState(null); 
  //flags for game permissions and state
  const [isAdmin, setIsAdmin] = useState(false); 
  const [isReady, setIsReady] = useState(false); 
  const [isEmbarking, setIsEmbarking] = useState(false); //track if launch animation started
  const [isFinale, setIsFinale] = useState(false);
  //tracks which character sheet is currently being viewed
  const [selectedPlayer, setSelectedPlayer] = useState(null); 
  //character sheet form states
  const [userDescription, setUserDescription] = useState(''); 
  const [tagsInput, setTagsInput] = useState('');
  const [ambitionInput, setAmbitionInput] = useState('Unknown');
  const [secretInput, setSecretInput] = useState('');
  //creation parameters
  const [setting, setSetting] = useState('');
  const [realism, setRealism] = useState('High');
  const [selectedWorld, setSelectedWorld] = useState('');
  const [availableWorlds, setAvailableWorlds] = useState([]);
  const [serverHasKey, setServerHasKey] = useState(null);
  //gameplay data containers
  const [messages, setMessages] = useState([]);
  const [partyStats, setPartyStats] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  //visual state for the d20 roll
  const [lastRoll, setLastRoll] = useState(null);
  //admin override state
  const [overrideText, setOverrideText] = useState('');
  const [showOverrideModal, setShowOverrideModal] = useState(false); // Updated to Modal Toggle
  //toggles right panel view between character sheet and world info
  const [activeTab, setActiveTab] = useState('character'); 
  //toggles sub-tabs within the world sheet
  const [worldTab, setWorldTab] = useState('history');
  //particles for embark explosion
  const [particles, setParticles] = useState([]);
  //ref used for auto-scrolling chat
  const chatEndRef = useRef(null);
  //state for model selector modal
  const [showModelModal, setShowModelModal] = useState(false);
  const [currentModel, setCurrentModel] = useState('gemini-2.5-flash-lite');
  //state for key update modal (feature request 1)
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [newKeyInput, setNewKeyInput] = useState('');
  //state for promotion modal (feature request 2)
  const [showPromoteModal, setShowPromoteModal] = useState(false);
  const [promoteTarget, setPromoteTarget] = useState('');
  const [revokeKeyOnPromote, setRevokeKeyOnPromote] = useState(false);
  //constants for when the kick screen is to be shown
  const [showKickModal, setShowKickModal] = useState(false);
  const [kickTarget, setKickTarget] = useState('');
  //TTS stuff
  //Audio context refs
  const audioCtxRef = useRef(null);
  const gainNodeRef = useRef(null);
  //TTS toggle state
  const [ttsEnabled, setTtsEnabled] = useState(false)
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  //SAM initialization
  const [samConfig, setSamConfig] = useState({
      pitch: 64,    // Default: 64. Lower (30-50) & Higher (100+) 
      speed: 72,    // Default: 72. lower is slower higher is faster
      throat: 128,  // Default: 128. modify timbre / roughness of voice
      mouth: 128,   // Default: 128. modifies vowel pronunciation
      volume: 50    // Default: 50. Volume of SAM. this actually modifies our gain node, not SAMs gain directly
  });
  const [sam, setSam] = useState(null);

  //debug stuff
  //since scoping will limit access to certain variables
  window.partyStats = partyStats; //allows me to see party stats within the console


  //helper function that plays text with the users defined configurations
  const playTTS = (text, config) => {
      const audioCtx = audioCtxRef.current;
      const gainNode = gainNodeRef.current;
      //make sure the audio context actually exists, and that the volume isn't set to 0
      if (!audioCtx || !gainNode) return;
      if (Number(config.volume) <= 0) return;
      //resume audio if the browser has suspended it (tabbing out)
      if (audioCtx.state === 'suspended') {
          audioCtx.resume();
      }
      //clean out markdown text since SAM may choke on it
      const cleanText = text.replace(/[*_#`]/g, ''); 
      // generate audio with SAM, to be exported as a buffer
      const tempSam = new SamJs({
          pitch: Number(config.pitch),
          speed: Number(config.speed),
          throat: Number(config.throat),
          mouth: Number(config.mouth)
      });
      try {
          //grab the raw audio buffer
          const audioData = tempSam.buf32(cleanText);
          if (audioData && audioData.length > 0) {
              //sample rate is 22050? https://github.com/pschatzmann/arduino-SAM says this so I'm trusting it for the audio buffer
              const buffer = audioCtx.createBuffer(1, audioData.length, 22050);
              buffer.getChannelData(0).set(audioData);
              const source = audioCtx.createBufferSource();
              source.buffer = buffer;
              // route the audio through the gain node, so we can actually control the volume of SAM
              source.connect(gainNode);
              source.start();
          }
      } catch (e) {
          console.error("SAM Audio Error:", e);
      }
  };

  //////////////////////////////////////
  //             useEffects           //
  //////////////////////////////////////
  //useEffects are automatically run at start
  //some of them only run once, some run when specific consts update, some run every time anything updates.

  //runs once at start, then never again.
  useEffect(() => {
    window.speechSynthesis.getVoices(); //grabs voices to initialize
    
    //attempt to rejoin if a session exists in local storage\\
    //runs once at start, then never again
    const savedSession = localStorage.getItem('gaol_session');
    if (savedSession) {
        try {
            const session = JSON.parse(savedSession);
            if (session.username && session.room) {
                console.log("Attempting Rejoin:", session);
                setUsername(session.username); //restore username state
                socket.emit('rejoin', { username: session.username, room: session.room });
            }
        } catch (e) {
            localStorage.removeItem('gaol_session');
        }
    }
  }, []); // the empty array at the end here tells use it only runs once at the very start.

    //initialize the web audio api
    useEffect(() => {
        // create AudioContext 
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
            const ctx = new AudioContext();
            const gain = ctx.createGain();
            
            // Connect Gain -> Destination
            gain.connect(ctx.destination);
            
            audioCtxRef.current = ctx;
            gainNodeRef.current = gain;
        }
    }, []);

   //initializing the SAM instance on mount
   useEffect(() => {
      const s = new SamJs({
          pitch: Number(samConfig.pitch),
          speed: Number(samConfig.speed),
          throat: Number(samConfig.throat),
          mouth: Number(samConfig.mouth)
      });
      setSam(s);
  }, [samConfig]);

   //handle the volume sliders
   useEffect(() => {
      if (gainNodeRef.current) {
          // Convert 0-100 slider to 0.0-1.0 gain
          const vol = samConfig.volume / 100;
          gainNodeRef.current.gain.value = vol * vol; 
      }
  }, [samConfig.volume]);
  
  //prevent infinite repetition
  const samConfigRef = useRef(samConfig);
  useEffect(() => {
      samConfigRef.current = samConfig;
  }, [samConfig]);

  //ask for all the world information from the backend.
  //runs once at start, then never again.
  useEffect(() => {
      socket.emit('get_worlds');
  }, []);

  //sets up all socket event listeners.
  //runs every time gameState or username are updated.
  useEffect(() => {
    debugLog("Opening Sockets")
    //LOGIN VIEW SOCKETS
    //request rooms immediately
    socket.emit('get_rooms');
    //populates the world dropdown in creation menu
    socket.on('world_list', (data) => {
        setAvailableWorlds(data);
        if(data.length > 0) setSelectedWorld(data[0].id);
        else setSelectedWorld('NEW');
    });
    //listen for server config to know if .env key exists
    socket.on('server_config', (data) => {
        setServerHasKey(data.has_env_key);
    });
    //updates the table of active rooms in the lobby
    socket.on('room_list', (data) => {
        setActiveRooms(data);
    });
    //set up polling interval for rooms list (every 3 seconds)
    const roomPollInterval = setInterval(() => {
        if(ui.view === 'login') {
            socket.emit('get_rooms');
        }
    }, 3000);

    //password Requirement Trigger
    socket.on('password_required', (data) => {
        setUi(prev => ({ ...prev, pendingRoom: data.room, statusMsg: "Password Required."}));
    });
    //handle room closure by host
    //this can be caused by emissions from
    //app.py : on_leave and handle_rejoin
    socket.on('room_closed', (data) => {
        setGameState('login');
        setRoom('');
        setMessages([]);
        setPartyStats([]);
        setIsReady(false);
        setIsAdmin(false);
        setStatusMsg(data.msg);
        setIsEmbarking(false);
        localStorage.removeItem('gaol_session'); //clear session
    });
    //handles successful room entry, switching view to game
    socket.on('join_success', (data) => {
      setAuth(prev => ({
        ...prev,
        room: data.room,
        username: data.username,
        isAdmin: data.is_admin
      }));
      setWorldData(data.world_details);
      if(data.history && data.history.length > 0) setMessages (data.history);
      setUi(prev => ({ ...prev, view: 'playing', statusMsg: 'Connected'}));

      //game states - to be removed
      setIsEmbarking(false);
      setIsFinale(false);

      localStorage.setItem('gaol_session', JSON.stringify({ username: data.username, room: data.room }));
    });
    
    //INGAME VIEW SOCKETS
    //listens for incoming chat messages
    socket.on('message', (data) => setMessages(prev => [...prev, data]));
    //updates the top status ticker
    socket.on('status', (data) => setStatusMsg(data.msg));
    //updates the list of players and their stats
    socket.on('game_state_update', (data) => setPartyStats(data));
    //updates world lore/events when ai triggers a change
    socket.on('world_update', (data) => setWorldData(data));
    //handle being kicked
    socket.on('kicked', (data) => {
        setGameState('login');
        setRoom('');
        setMessages([]);
        setPartyStats([]);
        setIsReady(false);
        setIsAdmin(false);
        setStatusMsg(data.msg);
        setIsEmbarking(false);
        setIsFinale(false);
        localStorage.removeItem('gaol_session'); //clear session
    });
    //handle admin status update (transfer)
    socket.on('admin_update', (data) => {
        setAuth(prev => ({ ...prev, isAdmin: data.is_admin }));
        setStatusMsg(data.is_admin ? "You are now the room's admin." : "Admin privileges have been removed.")
    });
    socket.on('room_close', handleExit);
    socket.on('kicked', handleExit);
    //END INGAME VIEW

    //cleanup listeners on unmount
    return () => { 
      debugLog("Closing Sockets")
      socket.off('message'); 
      socket.off('status'); 
      socket.off('game_state_update'); 
      socket.off('world_list');
      socket.off('server_config');
      socket.off('room_list');
      socket.off('join_success');
      socket.off('world_update');
      socket.off('room_closed');
      socket.off('password_required');
      socket.off('kicked');
      socket.off('admin_update');
      clearInterval(roomPollInterval); //clear interval
    };
  }, [ui.view]); //dependency on gameState ensuring interval respects login status

  //auto-scrolls to the bottom of chat when new messages arrive
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);
  //runs every time the messages field is updated

  //helper to find the current user's stats object
  const myStats = partyStats.find(p => p.name === auth.username) || { 
    name: auth.username, hp: 100, status: 'Alive', description: '', tags: [], ambition: '', secret: '', is_ready: false //default stuff
  };

  //TTS effects for story text, uses Software Automatic Mouth, an old piece of software.
  // TTS effects for story text
  useEffect(() => {
    if (!ttsEnabled || messages.length === 0 || !sam) return;
    const lastMsg = messages[messages.length - 1]; 
    
    if (lastMsg.sender === 'GAOL') { 
        //send to the playTTS function
        playTTS(lastMsg.text, samConfigRef.current);
    }
  }, [messages, ttsEnabled]);

  //syncs local form state with incoming server data for the user
  useEffect(() => {
      // if server has data, populate local state to prevent overwrites
      if(myStats.is_ready || (myStats.description && myStats.description.length > 0)) {
          if(myStats.is_ready) setIsReady(true);
          if(myStats.description) setUserDescription(myStats.description);
          if(myStats.tags) setTagsInput(myStats.tags.join(', '));
          if(myStats.ambition) setAmbitionInput(myStats.ambition);
          if(myStats.secret) setSecretInput(myStats.secret);
      }
  }, [myStats.is_ready, myStats.description, myStats.tags, myStats.ambition, myStats.secret, username]);
  //updates every time any of the player stats are updated. This reflects the servers AI changes onto the frontend

  //defaults the selected player view to the user on login
  useEffect(() => {
    if(username && !selectedPlayer) setSelectedPlayer(username);
  }, [username, selectedPlayer]);

  //determines which player to show in the right panel
  const displayedPlayer = partyStats.find(p => p.name === selectedPlayer) || myStats;

  //boolean to check if user is viewing their own sheet
  //this used to visually distinguish your sheet from another players (just flavoring for intuitiveness)
  const isOwnSheet = displayedPlayer.name === username;

  //we are locked if local state says so, OR if the server says so.
  const nonSystemMessages = messages.filter(m => m.sender !== 'System'); //filters out system messages from all the messages
  const isGameActive = nonSystemMessages.length > 0; //if messages have been sent that aren't system messages (e.g. changing AI model), the game is active
  const isLockedIn = isReady || myStats.is_ready || isGameActive;

  //////////////////////////////////////
  //          INGAME HANDLERS         //
  //////////////////////////////////////


  //trigger for admin to start the game loop
  const handleEmbark = (e) => {
    setIsEmbarking(true); // Hide the button immediately
    // Generate particles
    const rect = e.target.getBoundingClientRect();
    const newParticles = [];
    for (let i = 0; i < 30; i++) {
        // Random angle and distance for explosion
        const angle = Math.random() * Math.PI * 2;
        const velocity = 50 + Math.random() * 100;
        const tx = Math.cos(angle) * velocity + 'px';
        const ty = Math.sin(angle) * velocity + 'px';
        
        newParticles.push({
            id: Date.now() + i,
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
            tx,
            ty
        });
    }
    setParticles(newParticles);
    
    // Clear particles after animation
    setTimeout(() => setParticles([]), 1000);

    socket.emit('embark', { room });
  };

  // Room Closed / Kicked
  const handleExit = (data) => {
      setUi(prev => ({ ...prev, view: 'login', statusMsg: data.msg }));
      setAuth(prev => ({ ...prev, room: '', isAdmin: false }));
      setMessages([]);
      setPartyStats([]);
      setIsReady(false);
      localStorage.removeItem('gaol_session');
  };

  //cleanly handle the leave room button
  const handleLeave = () => {
      if(room) {
          socket.emit('leave_room', { room });
      }
      //reset local state
      setGameState('login');
      setRoom('');
      setMessages([]);
      setPartyStats([]);
      setIsReady(false);
      setIsAdmin(false);
      setStatusMsg("Disconnected.");
      localStorage.removeItem('gaol_session'); // clear session explicitly
  };

  //handle game finale
  const handleFinale = () => {
    setIsFinale(true);
    socket.emit('finale', { room });
    //setIsReady(false);
  }


  //submits character sheet data to the server
  //emission triggered by app.py : handle_player_ready
  const handleReady = () => {
      //prevent overwrite if already ready (checking LockedIn, which covers both server and client state)
      if(isLockedIn) return;

      const tags = tagsInput.split(',').filter(t => t.trim().length > 0);
      if(tags.length === 0) { setStatusMsg("Define your character tags."); return; }
      if(tags.length > 5) { setStatusMsg("Too many tags (Max 5)."); return; }
      if(!ambitionInput.trim()) { setStatusMsg("Define your ambition."); return; }

      setIsReady(true);
      socket.emit('player_ready', { 
          room, 
          description: userDescription, 
          tags: tags,
          ambition: ambitionInput,
          secret: secretInput
      });
  };
  //stream words one at a time for a more dramatic flair.
  const streamMessage = (message) => {
     

  };

  //User Submits Action (hits enter from input box)
  //sends player chat/action to server and rolls a client-side die
  const sendAction = () => {
    if(isFinale) {
        return;
    }
    if (inputValue.trim()) {
      const roll = Math.floor(Math.random() * 20) + 1; //generates a number between 1-20
      //FIXME: Perhaps in the future we should add die modifiers like DnD? Things like advantage or bonuses.
      setLastRoll(roll);
      socket.emit('player_action', { username, room, message: inputValue, roll: roll });
      setInputValue('');
    }
  };

  //DM Override button
  //sends admin override to server
  const sendOverride = () => {
      if (overrideText.trim()) {
          socket.emit('submit_override', { room, text: overrideText });
          setOverrideText('');
          setShowOverrideModal(false); // return to normal view
      }
  };

  //AI Model Change Button
  //handles admin changing the AI model
  const handleModelChange = (modelName) => {
      socket.emit('change_model', { room, model: modelName });
      setCurrentModel(modelName);
      setShowModelModal(false);
  };

  //API Key button
  //inputting a new api key
  const submitNewKey = () => {
      if(newKeyInput.trim().length > 10) {
          socket.emit('update_api_key', { room, new_key: newKeyInput });
          setShowKeyModal(false);
          setNewKeyInput('');
      } else {
          //simple validation feedback
          setStatusMsg("Invalid Key Length.");
      }
  };

  //Party View Kick Button
  //kicking a player
  const handleKick = (targetName, e) => {
      e.stopPropagation(); //prevent selecting the card
      setKickTarget(targetName);
      setShowKickModal(true);
  };
  //pop-up to confirm the kicking
  //FIXME: this uses the default browser pop up, ugly
  const confirmKick = () => {
       socket.emit('kick_player', { room, target_name: kickTarget });
       setShowKickModal(false);
  };

  //Party View Promote Button
  //user promotion modal
  const handlePromote = (targetName, e) => {
      e.stopPropagation();          //prevent selecting the card
      setPromoteTarget(targetName);
      setRevokeKeyOnPromote(false); //default unchecked
      setShowPromoteModal(true);
  };
  //submit promotions
  const submitPromote = () => {
      socket.emit('promote_player', { 
          room, 
          target_name: promoteTarget, 
          revoke_key: revokeKeyOnPromote 
      });
      setShowPromoteModal(false);
  };

  //check to see if everyone is ready so embark button can be enabled
  const allPlayersReady = partyStats.length > 0 && partyStats.every(p => p.is_ready);
  
  //preprocessing on messages sent back from the server.
  //Currently uses regex to highlight player names, for visual flavor
  const handleMessages = (data) => {
    setMessages((prev) => [...prev, data]);
  };

  //World Sheet Filters

  //FIGURES
  //grabs the major NPCs and Figures from the worlds.json file 
  const getFigures = () => {
      if(!worldData) return [];
      
      const figures = [];
      
      // get explicit NPCs/Characters from the 'characters' list
      if(worldData.characters && worldData.characters.length > 0) {
          worldData.characters.forEach(c => {
              figures.push({
                  name: c.name,
                  title: c.role || "Character",
                  desc: c.description,
                  aff: c.affiliation,
                  status: c.status
              });
          });
      }
      
      // get entity-based deities / gods etc.
      // FIXME: This is kind of stupid. We shouldn't have to use any explicit names for recognition.
      if(worldData.entities) {
          const godTypes = ['god', 'deity', 'titan', 'entity', 'lord', 'king', 'queen', 'emperor', 'leader', 'ceo', 'director', 'don']; //NOTE: Is this even used anymore?
          worldData.entities.forEach(e => {
              const lowerType = e.type.toLowerCase();
              if(godTypes.some(t => lowerType.includes(t))) {
                  // avoid duplicates if it's already in characters
                  if(!figures.some(f => f.name === e.name)) {
                       figures.push({
                          name: e.name,
                          title: e.type,
                          desc: e.description,
                          aff: "Divine / Sovereign"
                      });
                  }
              }
          });
      }
      
      return figures;
  };
  
  //FACTIONS
  //grabs factions from the worlds.json sheet
  const getFactions = () => {
      if(!worldData) return [];
      return worldData.groups || [];
  };

  //BIOLOGY
  //grabs biology from the worlds.json sheet
  const getBiology = () => {
      if(!worldData) return [];
      return worldData.biology || [];
  };

  //LOCATIONS
  //helper to aggregate locations from both new system and legacy entities
  const getLocations = () => {
      if(!worldData) return [];
      //get new system locations with coordinates
      return worldData.locations || [];
  };

  const showSheetPrompt = !isLockedIn && nonSystemMessages.length === 0 && activeTab === 'character' && isOwnSheet;


  ///////////////////////////////////////////////
  //                                           //
  //              RENDERING LOGIC              //
  //                                           //
  ///////////////////////////////////////////////
  
  //render logic for the initial login/lobby screen
  if (ui.view === 'login') {
    return (
        <LoginScreen 
            auth={auth}        // Pass the grouped object
            setAuth={setAuth}  // Pass the updater
            ui={ui}
            setUi={setUi}
            socket={socket}
            activeRooms={game.activeRooms}
            availableWorlds={availableWorlds}
        />
    );
  } else if (ui.view === 'playing') {
    return (
        <GameScreen 
            auth={auth}        // Pass the grouped object
            setAuth={setAuth}  // Pass the updater
            ui={ui}
            setUi={setUi}
            socket={socket}
            joinedWorldData={worldData}
        />
    );
  //render logic for the main game interface
  return (
    <div className="main-layout">
      {/* Particle Effect Layer */}
      {particles.map(p => (
          <div 
             key={p.id} 
             className="particle"
             style={{
                 left: p.x, 
                 top: p.y, 
                 '--tx': p.tx, 
                 '--ty': p.ty 
             }}
          />
      ))}

      {/* Left Navigation Panel */}
      <div className="nav-panel">
          {/* Leave Button */}
          <button className="nav-btn leave-btn" onClick={handleLeave} title="Leave Room">
             LEAVE
          </button>
          {/* TTS Toggle Button */}
          <button 
            className={`nav-btn ${ttsEnabled ? 'active' : ''}`} 
            onClick={() => setTtsEnabled(!ttsEnabled)} 
            title="Toggle Text-to-Speech"
            style={{ 
                color: ttsEnabled ? 'var(--terminal-green)' : '#555',
                borderColor: ttsEnabled ? 'var(--terminal-green)' : '#333'
            }}
           >
         {ttsEnabled ? 'TTS ON' : 'TTS OFF'}
            </button>
          {/* TTS Options Button */}
            <button 
                className={`nav-btn ttsmod-btn ${showVoiceModal ? 'active' : ''}`}
                onClick={() => setShowVoiceModal(true)}
                title="Voice Settings"
            >
                Modify TTS 
            </button>
          {/* Admin Model Switcher */}
          {isAdmin && (
              <button className="nav-btn model-btn" onClick={() => setShowModelModal(true)} title="Change AI Model">
                 MODEL
              </button>
          )}
          {/* Admin API Key Button */}
          {isAdmin && (
              <button className="nav-btn key-btn" onClick={() => setShowKeyModal(true)} title="Update API Key">
                 KEY
              </button>
          )}
          {/* Admin Injection Button */}
          {isAdmin && (
              <button className="nav-btn god-mode-btn" onClick={() => setShowOverrideModal(true)} title="God Mode">
                 GOD
              </button>
          )}
          {/* End Game Button - starts finale sequence*/}
            <button className={`nav-btn`} onClick={handleFinale} title="End Game">
                End Game 
            </button>
      </div>

      {/* Left side: Chat, Input, Dice */}
      <div className="left-panel">
        <div className={`status-ticker ${statusMsg.includes('THINKING') ? 'thinking' : ''}`}>
           STATUS: {statusMsg} | WORLD: {currentWorldName}
        </div>

        <div className="chat-window">
            {/* embark button only visible to admin in pre-game */}
            {nonSystemMessages.length === 0 && isAdmin && !isEmbarking && (
                <div className="embark-overlay">
                    <button 
                        className="embark-btn" 
                        onClick={handleEmbark}
                        disabled={!allPlayersReady}
                        style={{ opacity: allPlayersReady ? 1 : 0.5, cursor: allPlayersReady ? 'pointer' : 'not-allowed' }}
                    >
                        {allPlayersReady ? "EMBARK" : "WAITING FOR PLAYERS..."}
                    </button>
                </div>
            )}
            
            {/* waiting text for non-admins */}
            {nonSystemMessages.length === 0 && !isAdmin && (
                <div className="embark-overlay">
                    <div style={{color:'#666', fontStyle:'italic'}}>
                        {isLockedIn ? "Waiting for host to start..." : "Fill out character sheet..."}
                    </div>
                </div>
            )}

          {/* chat history mapping */}
          {messages.map((m, i) => (
            <div key={i} className={`message-block ${m.sender === 'GAOL' ? 'gaol-msg' : 'player-msg'}`}>
              <div className="msg-header">
                {m.sender === 'GAOL' ? 'GAOL:' : (m.sender === 'System' ? 'SYS:' : 'Actions:')}
              </div>
              <div id="msg-body" className="msg-body" style={{color: m.sender === 'System' ? '#555' : 'inherit', fontStyle: m.sender === 'System' ? 'italic' : 'normal'}}>
                {m.sender !== 'GAOL' && m.sender !== 'System' && <span className="player-name">{m.sender}<br></br></span>}
                <span dangerouslySetInnerHTML={{__html: streamMessage(m.text)}} />
              </div>
            </div>
          ))}
          {/* invisible element to force scroll to bottom */}
          <div ref={chatEndRef} />
        </div>

        <div className="input-area">
          <span className="prompt-arrow">{'>'}</span>
          <input 
            value={inputValue} 
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendAction()}
            placeholder={!isFinale ? "Describe your action..." : "Campaign has ended."}
            /* filter out system messages so model changes don't enable chat too early */
            disabled={nonSystemMessages.length === 0 || isFinale} 
          />
          {/* Dice - Eventually we'll have frames to animate this rolling process */}
          <div className="dice-display">
              <div className="dice-label">D20</div>
              <div className={`dice-value ${lastRoll === 20 ? 'crit-success' : lastRoll === 1 ? 'crit-fail' : ''}`}>
                  {lastRoll !== null ? lastRoll : '-'}
              </div>
          </div>
        </div>
      </div>

      {/* Right side: Party Grid and Detail View */}
      <div className="right-panel">
        <div className="party-grid">
          {partyStats.map((p, i) => (
            <div 
                key={i} 
                className={`mini-card ${p.name === selectedPlayer ? 'selected' : ''} ${p.name === username ? 'own-player' : ''}`}
                onClick={() => { setSelectedPlayer(p.name); setActiveTab('character'); }}
            >
              <div className="mini-name">#{i+1} {p.name}</div>
              <div className="mini-stat">HP: {p.hp}</div>
              <div className="mini-stat">{p.status}</div>
              {/* shows ready tag if in lobby, or acted tag if in game */}
              {((nonSystemMessages.length === 0 && p.is_ready) || (nonSystemMessages.length > 0 && p.has_acted)) && (
                  <div className="ready-indicator">READY</div>
              )}

              {/* Admin Controls On Cards*/}
              {isAdmin && p.name !== username && (
                  <div className="card-admin-overlay">
                      <button className="admin-control-btn promote" onClick={(e) => handlePromote(p.name, e)} title="Promote to Admin">^</button>
                      <button className="admin-control-btn kick" onClick={(e) => handleKick(p.name, e)} title="Kick Player">x</button>
                  </div>
              )}
            </div>
          ))}
          {/* fill empty slots to maintain grid structure */}
          {[...Array(Math.max(0, 6 - partyStats.length))].map((_, i) => (
            <div key={`empty-${i}`} className="mini-card empty">
              <span className="empty-slot">EMPTY</span>
            </div>
          ))}
        </div>

        <div className="detail-view">
          {/* tabs for switching detail context */}
          <div className="tab-bar">
             <button 
               className={`tab-btn ${activeTab === 'character' ? 'active' : ''}`}
               onClick={() => {setActiveTab('character'); setShowOverrideModal(false);}}
             >
               CHARACTER SHEET
             </button>
             <button 
               className={`tab-btn ${activeTab === 'world' ? 'active' : ''}`}
               onClick={() => {setActiveTab('world'); setShowOverrideModal(false);}}
             >
               WORLD SHEET
             </button>
          </div>

          {activeTab === 'character' ? (
                  <>
                    <div className="detail-row">
                        <div className="detail-header">
                            <h2>{displayedPlayer.name}</h2>
                            <div className="detail-stats">
                                <div>Health: {displayedPlayer.hp} / 100</div>
                                <div>Status: {displayedPlayer.status}</div>
                            </div>
                        </div>
                        {/* dynamic icon based on setting/realism first letters */}
                        <div className="portrait-small">
                            {setting ? setting[0] : '?'}{realism ? realism[0] : '?'}
                        </div>
                    </div>
                    
                    {/* conditionally applies the particle glow if user needs to fill sheet */}
                    <div className={`sheet-columns ${showSheetPrompt ? 'sheet-attention-glow' : ''}`}>
                        <div className="sheet-left">
                            <label style={{fontSize:'0.7rem', color:'#666', marginBottom:'5px'}}>CHARACTER SUMMARY</label>
                            {/* editable only if it is users sheet and they aren't locked in */}
                            <textarea 
                                style={{flexGrow:1, resize:'none'}}
                                placeholder="Briefly describe your character..." 
                                value={isOwnSheet ? userDescription : (displayedPlayer.description || '')}
                                onChange={e => isOwnSheet && setUserDescription(e.target.value)}
                                disabled={!isOwnSheet || (isOwnSheet && isLockedIn)} 
                            />
                        </div>
                        <div className="sheet-right">
                            <div style={{marginBottom: '10px'}}>
                                <div style={{display:'flex', justifyContent:'space-between'}}>
                                    <label style={{fontSize:'0.7rem', color:'#666'}}>TAGS</label>
                                    <span className="input-instruction">{isOwnSheet ? "Max 5" : ""}</span>
                                </div>
                                <input 
                                    className="sheet-input"
                                    placeholder="e.g. Human, Warrior, Strong" 
                                    value={isOwnSheet ? tagsInput : (displayedPlayer.tags ? displayedPlayer.tags.join(', ') : '')}
                                    onChange={e => isOwnSheet && setTagsInput(e.target.value)}
                                    disabled={!isOwnSheet || (isOwnSheet && isLockedIn)} 
                                />
                            </div>
                            <div style={{marginBottom: '10px'}}>
                                <label style={{fontSize:'0.7rem', color:'#666'}}>AMBITION</label>
                                <input 
                                    className="sheet-input"
                                    placeholder="e.g. Become King" 
                                    value={isOwnSheet ? ambitionInput : (displayedPlayer.ambition || '')}
                                    onChange={e => isOwnSheet && setAmbitionInput(e.target.value)}
                                    disabled={!isOwnSheet || (isOwnSheet && isLockedIn)} 
                                />
                            </div>
                            <div style={{flexGrow: 1, display:'flex', flexDirection:'column'}}>
                                <label style={{fontSize:'0.7rem', color:'#666'}}>SECRET</label>
                                {/* secrets are hidden for other players */}
                                {isOwnSheet ? (
                                    <textarea 
                                        style={{flexGrow:1, background:'#000', border:'1px solid #333', color:'var(--text-main)', padding:'8px', outline:'none', resize:'none', fontSize:'0.9rem'}}
                                        placeholder="Hidden info..." 
                                        value={secretInput}
                                        onChange={e => setSecretInput(e.target.value)}
                                        disabled={isLockedIn} 
                                    />
                                ) : (
                                    <div className="secret-mask">
                                        What secrets may {displayedPlayer.name} hold?
                                    </div>
                                )}
                            </div>
                            {/* confirm button logic */}
                            {isOwnSheet && (
                                !isLockedIn ? (
                                    <button className="ready-btn" onClick={handleReady} style={{width:'100%', padding:'10px'}}>
                                        CONFIRM & READY
                                    </button>
                                ) : (
                                    <></>
                                )
                            )}
                        </div>
                    </div>
                  </>
          ) : (
              <div className="world-sheet">
                 {/* displays world info if loaded */}
                 {worldData ? (
                     <>
                        <div className="world-header">
                            <h2>{worldData.name}</h2>
                            <div className="world-meta">
                                <span>{worldData.setting}</span> | <span>{worldData.realism} Realism</span>
                            </div>
                        </div>
                        <div className="map-placeholder">
                            <div className="map-text">HIC SUNT DRACONES</div>
                            <div className="map-subtext">
                                (Territory Uncharted)
                            </div>
                        </div>
                        
                        {/* World Sub-Tabs */}
                        <div className="sub-tab-bar">
                            <button className={`sub-tab-btn ${worldTab === 'history' ? 'active' : ''}`} onClick={()=>setWorldTab('history')}>HISTORY</button>
                            <button className={`sub-tab-btn ${worldTab === 'locations' ? 'active' : ''}`} onClick={()=>setWorldTab('locations')}>LOCATIONS</button>
                            <button className={`sub-tab-btn ${worldTab === 'figures' ? 'active' : ''}`} onClick={()=>setWorldTab('figures')}>FIGURES</button>
                            <button className={`sub-tab-btn ${worldTab === 'factions' ? 'active' : ''}`} onClick={()=>setWorldTab('factions')}>FACTIONS</button>
                            <button className={`sub-tab-btn ${worldTab === 'biology' ? 'active' : ''}`} onClick={()=>setWorldTab('biology')}>BIOLOGY</button>
                        </div>

                        {/* scrollable list of content based on tab */}
                        <div className="world-events-list">
                            {worldTab === 'history' && (
                                worldData.major_events && worldData.major_events.length > 0 ? (
                                    worldData.major_events.map((e, i) => (
                                        <div key={i} className="entity-item">
                                            <div className="entity-name">{typeof e === 'string' ? 'Event Log' : e.title}</div>
                                            <div className="entity-type">History</div>
                                            <div className="entity-desc">{typeof e === 'string' ? e : e.description}</div>
                                        </div>
                                    ))
                                ) : <div style={{color:'#555'}}>No major history yet.</div>
                            )}

                            {worldTab === 'locations' && (
                                getLocations().length > 0 ? (
                                    getLocations().map((e, i) => (
                                        <div key={i} className="entity-item">
                                            <div className="entity-name">{e.name}</div>
                                            <div className="entity-type">{e.type}</div>
                                            <div className="entity-desc">{e.description}</div>
                                            <div style={{fontSize: '0.75rem', color: 'var(--accent-dim)', marginTop: '5px', fontStyle:'italic'}}>
                                                Coordinates: {e.x}, {e.y} | Size: {e.radius} | Controlled by: {e.affiliation || "Independent"}
                                            </div>
                                        </div>
                                    ))
                                ) : <div style={{color:'#555'}}>No known locations.</div>
                            )}

                            {worldTab === 'figures' && (
                                getFigures().length > 0 ? (
                                    getFigures().map((e, i) => (
                                        <div key={i} className="entity-item">
                                            <div className="entity-name">{e.name}</div>
                                            <div className="entity-type">{e.title}</div>
                                            <div className="entity-desc">{e.desc}</div>
                                            {e.aff && <div style={{fontSize: '0.75rem', color: '#666', marginTop:'5px'}}>Affiliation: {e.aff}</div>}
                                        </div>
                                    ))
                                ) : <div style={{color:'#555'}}>No major figures known.</div>
                            )}

                            {worldTab === 'factions' && (
                                getFactions().length > 0 ? (
                                    getFactions().map((e, i) => (
                                        <div key={i} className="entity-item">
                                            <div className="entity-name">{e.name}</div>
                                            <div className="entity-type">{e.type}</div>
                                            <div className="entity-desc">{e.description}</div>
                                        </div>
                                    ))
                                ) : <div style={{color:'#555'}}>No major factions known.</div>
                            )}

                            {worldTab === 'biology' && (
                                getBiology().length > 0 ? (
                                    getBiology().map((e, i) => (
                                        <div key={i} className="entity-item">
                                            <div className="entity-name">{e.name}</div>
                                            {e.disposition && <div style={{fontSize: '0.8rem', color: '#aaac2d', marginTop:'5px'}}>Disposition: {e.disposition}</div>}
                                            <div className="entity-desc">{e.description}</div>
                                            <div className="entity-type">Habitat: {e.habitat}</div>
                                        </div>
                                    ))
                                ) : <div style={{color:'#555'}}>No known biology.</div>
                            )}
                        </div>
                     </>
                 ) : (
                     <div>Loading world data...</div>
                 )}
              </div>
          )}
        </div>
      </div>
        {/* Voice Settings Modal */}
        {showVoiceModal && (
            <div className="about-modal-overlay">
                <div className="about-modal-box">
                    <h2 style={{color:'var(--terminal-green)', borderColor:'#004d00'}}>Configure SAM</h2>
                    <p style={{color:'#666', marginBottom:'20px', fontSize:'0.8rem', fontStyle:'italic'}}>
                        Configuring Software Automatic Mouth (S.A.M.)
                    </p>
                    
                    <div className="slider-container" style={{width:'100%', display:'flex', flexDirection:'column', gap:'15px'}}>
                        
                        {/* Pitch Slider */}
                        <div className="slider-row">
                            <div className="slider-label">
                                <span>PITCH</span>
                                <span>{220 - samConfig.pitch}</span>
                            </div>
                            <input 
                                type="range" min="20" max="200" 
                                //flipped so the slider is more intuitive, otherwise making the value higher would lower the pitch
                                value={220 - samConfig.pitch} 
                                onChange={e => setSamConfig({
                                    ...samConfig, 
                                    pitch: 220 - Number(e.target.value)
                                })}
                                className="terminal-range"
                            />
                        </div>

                        {/* Speed Slider */}
                        <div className="slider-row">
                            <div className="slider-label">
                                <span>SPEED</span>
                                <span>{230 - samConfig.speed}</span>
                            </div>
                            <input 
                                type="range" min="30" max="200" 
                                // INVERTED VALUE MAPPING - speed for SAM is "flipped" and actually refers the the time between ununciations, so we flip it to make it more intuitive
                                value={230 - samConfig.speed}
                                onChange={e => setSamConfig({
                                    ...samConfig, 
                                    speed: 230 - Number(e.target.value)
                                })}
                                className="terminal-range"
                            />
                        </div>

                        {/* Throat Slider */}
                        <div className="slider-row">
                            <div className="slider-label">
                                <span>THROAT</span>
                                <span>{samConfig.throat}</span>
                            </div>
                            <input 
                                type="range" min="10" max="255" 
                                value={samConfig.throat}
                                onChange={e => setSamConfig({...samConfig, throat: e.target.value})}
                                className="terminal-range"
                            />
                        </div>

                        {/* Mouth Slider */}
                        <div className="slider-row">
                            <div className="slider-label">
                                <span>MOUTH</span>
                                <span>{samConfig.mouth}</span>
                            </div>
                            <input 
                                type="range" min="10" max="255" 
                                value={samConfig.mouth}
                                onChange={e => setSamConfig({...samConfig, mouth: e.target.value})}
                                className="terminal-range"
                            />
                        </div>

                        {/* Divider */}
                        <div style={{borderBottom:'1px solid #333', margin:'5px 0'}}></div>

                         {/* Volume Slider (Software Gate) */}
                         <div className="slider-row">
                            <div className="slider-label">
                                <span>VOLUME</span>
                                <span>{samConfig.volume}%</span>
                            </div>
                            <input 
                                type="range" min="0" max="100" 
                                value={samConfig.volume}
                                onChange={e => setSamConfig({...samConfig, volume: e.target.value})}
                                className="terminal-range"
                            />
                        </div>
                    </div>

                    <div style={{display:'flex', gap:'10px', width:'100%', marginTop:'25px'}}>
                        <button 
                            className="join-sm-btn" 
                            style={{flex:1, borderColor:'#555', color:'#888'}} 
                            onClick={() => {
                                // Reset to defaults
                                setSamConfig({pitch: 64, speed: 72, throat: 128, mouth: 128, volume: 50});
                            }}
                        >
                            RESET
                        </button>
                        <button 
                            className="action-btn" 
                            style={{flex:1, marginTop:0, background:'var(--terminal-green)'}} 
                            onClick={() => {
                                setShowVoiceModal(false);
                                playTTS("GAOL has spoken.", samConfig); // test phrase
                            }}
                        >
                            CONFIRM
                        </button>
                    </div>
                </div>
            </div>
        )}
        {/* Model Selection Modal */}
        {showModelModal && (
             <div className="about-modal-overlay">
                 <div className="about-modal-box">
                      <h2 style={{color:'#b080ff', borderColor:'#3a2a55'}}>NEURAL SHIFT</h2>
                      <p style={{color:'#666', marginBottom:'15px', fontStyle:'italic'}}>Select the active intelligence model.</p>
                      
                      <div className="model-list">
                          {['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'].map(m => (
                              <button 
                                key={m}
                                className={`model-option-btn ${currentModel === m ? 'active' : ''}`}
                                onClick={() => handleModelChange(m)}
                              >
                                  <span>{m}</span>
                                  {currentModel === m && <span style={{color:'#b080ff'}}>●</span>}
                              </button>
                          ))}
                      </div>
                      
                      <button className="join-sm-btn" style={{width: '100%', marginTop: '20px', borderColor:'#333', color:'#555'}} onClick={() => setShowModelModal(false)}>CANCEL</button>
                 </div>
             </div>
        )}
        
        {/* Admin Override Modal */}
        {showOverrideModal && (
             <div className="about-modal-overlay">
                 <div className="about-modal-box">
                      <h2 style={{color:'var(--alert-red)', borderColor:'#330000'}}>GOD MODE</h2>
                      <p style={{color:'#666', marginBottom:'15px', fontStyle:'italic', textAlign:'center'}}>
                         Inject story overrides for the next turn.
                      </p>
                      <textarea 
                        className="override-textarea"
                        placeholder="e.g. 'Force a dragon attack' or 'Make the chest a mimic'."
                        value={overrideText}
                        onChange={e => setOverrideText(e.target.value)}
                        style={{width: '100%', height:'150px'}}
                      />
                      <div className="override-actions" style={{width:'100%', marginTop:'15px'}}>
                          <button className="ready-btn" style={{flex:1, background:'#333', color:'#888'}} onClick={() => setShowOverrideModal(false)}>CANCEL</button>
                          <button className="ready-btn" style={{flex:1, background:'var(--alert-red)', color:'#000'}} onClick={sendOverride}>INJECT</button>
                      </div>
                 </div>
             </div>
        )}

        {/* API Key Update Modal */}
        {showKeyModal && (
            <div className="about-modal-overlay">
                <div className="about-modal-box">
                    <h2 style={{color:'var(--tech-cyan)', borderColor:'#004d55'}}>API CONFIG</h2>
                    <p style={{color:'#666', marginBottom:'15px', fontStyle:'italic'}}>Update the session API Key.</p>
                    <input 
                        className="sheet-input"
                        type="password"
                        placeholder="New API Key..."
                        value={newKeyInput}
                        onChange={e => setNewKeyInput(e.target.value)}
                        style={{textAlign: 'center', borderColor: 'var(--tech-cyan)', color: 'var(--tech-cyan)'}}
                    />
                    <div style={{display:'flex', gap:'10px', width:'100%', marginTop:'20px'}}>
                        <button className="join-sm-btn" style={{flex:1, borderColor:'#333', color:'#555'}} onClick={() => setShowKeyModal(false)}>CANCEL</button>
                        <button className="join-sm-btn" style={{flex:1, borderColor:'var(--tech-cyan)', color:'var(--tech-cyan)'}} onClick={submitNewKey}>UPDATE</button>
                    </div>
                </div>
            </div>
        )}

        {/* Promotion Confirmation Modal */}
        {showPromoteModal && (
            <div className="about-modal-overlay">
                <div className="about-modal-box">
                    <h2 style={{color:'var(--tech-cyan)', borderColor:'#004d55'}}>TRANSFER ADMIN</h2>
                    <p style={{color:'#ccc', marginBottom:'15px', textAlign:'center'}}>
                        Are you sure you want to promote <b>{promoteTarget}</b>?
                    </p>
                    <div style={{display:'flex', alignItems:'center', gap:'10px', marginBottom:'20px'}}>
                         <input 
                            type="checkbox" 
                            id="revokeCheck" 
                            className="custom-checkbox"
                            checked={revokeKeyOnPromote}
                            onChange={e => setRevokeKeyOnPromote(e.target.checked)}
                         />
                         <label htmlFor="revokeCheck" style={{color:'#888', fontSize:'0.9rem', cursor:'pointer'}}>
                            Revoke my API Key (New admin must provide one)
                         </label>
                    </div>
                    <div style={{display:'flex', gap:'10px', width:'100%'}}>
                        <button className="join-sm-btn" style={{flex:1, borderColor:'#333', color:'#555'}} onClick={() => setShowPromoteModal(false)}>CANCEL</button>
                        <button className="join-sm-btn" style={{flex:1, borderColor:'var(--tech-cyan)', color:'var(--tech-cyan)'}} onClick={submitPromote}>CONFIRM</button>
                    </div>
                </div>
            </div>
        )}
      {/* Kick Confirmation Modal */}
        {showKickModal && (
            <div className="about-modal-overlay">
                <div className="about-modal-box">
                    <h2 style={{color:'var(--alert-red)', borderColor:'#330000'}}>KICK PLAYER</h2>
                    <p style={{color:'#ccc', marginBottom:'15px', textAlign:'center'}}>
                        Are you sure you want to remove <b>{kickTarget}</b> from the session?
                    </p>
                    <div style={{display:'flex', gap:'10px', width:'100%', marginTop:'10px'}}>
                        <button className="join-sm-btn" style={{flex:1, borderColor:'#333', color:'#555'}} onClick={() => setShowKickModal(false)}>CANCEL</button>
                        <button className="join-sm-btn" style={{flex:1, borderColor:'var(--alert-red)', color:'var(--alert-red)'}} onClick={confirmKick}>REMOVE</button>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
}
}

export default App;