import { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import './App.css';

const socket = io('http://localhost:5000');

function App() {
  const [gameState, setGameState] = useState('login'); 
  //login toggle state
  const [loginMode, setLoginMode] = useState('join'); 

  const [username, setUsername] = useState('');
  const [room, setRoom] = useState('');
  //world tracking
  const [currentWorldName, setCurrentWorldName] = useState('');
  const [worldData, setWorldData] = useState(null); // stores detailed world info
  
  // Game Flow State
  const [isAdmin, setIsAdmin] = useState(false); // Only true for the room creator
  const [isReady, setIsReady] = useState(false); // Local ready state for Lobby
  
  // Character Sheet State
  const [userDescription, setUserDescription] = useState(''); // Visual/Narrative description
  const [tagsInput, setTagsInput] = useState('');
  const [ambitionInput, setAmbitionInput] = useState('Unknown');
  const [secretInput, setSecretInput] = useState('');

  //creation parameters
  const [setting, setSetting] = useState('Medieval Fantasy');
  const [realism, setRealism] = useState('High');
  const [selectedWorld, setSelectedWorld] = useState('');
  const [newWorldName, setNewWorldName] = useState('');
  const [availableWorlds, setAvailableWorlds] = useState([]);

  const [messages, setMessages] = useState([]);
  const [partyStats, setPartyStats] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [statusMsg, setStatusMsg] = useState('System Ready...');
  
  //UI state
  const [activeTab, setActiveTab] = useState('character'); // 'character' or 'world'

  const chatEndRef = useRef(null);

  useEffect(() => {
    //basic socket listeners
    socket.on('message', (data) => {
      setMessages((prev) => [...prev, data]);
    });

    socket.on('status', (data) => {
      setStatusMsg(data.msg);
    });

    socket.on('game_state_update', (data) => {
      setPartyStats(data);
    });
    
    //populate world dropdown
    socket.on('world_list', (data) => {
        setAvailableWorlds(data);
        if(data.length > 0) {
            setSelectedWorld(data[0].id);
        } else {
            setSelectedWorld('NEW');
        }
    });

    //successful join handler
    socket.on('join_success', (data) => {
      setRoom(data.room);
      setCurrentWorldName(data.world);
      setWorldData(data.world_details); //store full world details
      setIsAdmin(data.is_admin); // Set admin privileges
      
      //load existing history for late joiners
      if(data.history && data.history.length > 0) {
          setMessages(data.history);
      }
      
      setGameState('playing');
    });

    //listen for dynamic world updates (lore added during game)
    socket.on('world_update', (data) => {
        setWorldData(data);
    });

    //fetch worlds on mount
    socket.emit('get_worlds');

    return () => { 
      socket.off('message'); 
      socket.off('status'); 
      socket.off('game_state_update'); 
      socket.off('world_list');
      socket.off('join_success');
      socket.off('world_update');
    };
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Derived state for the current user's stats
  const myStats = partyStats.find(p => p.name === username) || { 
    name: username, hp: 100, status: 'Alive', description: '', tags: [], ambition: '', secret: ''
  };

  // Sync logic: If the user is locked (ready), update their text box if the Server (AI) changes it.
  useEffect(() => {
      if(isReady) {
          if(myStats.description) setUserDescription(myStats.description);
          if(myStats.tags) setTagsInput(myStats.tags.join(', '));
          if(myStats.ambition) setAmbitionInput(myStats.ambition);
      }
  }, [myStats.description, myStats.tags, myStats.ambition, isReady]);

  //join existing room
  const handleJoin = () => {
    if (username && room) {
      socket.emit('join', { username, room });
    }
  };

  //create new room logic
  const handleCreate = () => {
    if (username && room) {
      const finalWorldSelection = selectedWorld || 'NEW';
      
      socket.emit('create_room', {
        username,
        room,
        setting,
        realism,
        world_selection: finalWorldSelection,
        new_world_name: newWorldName
      });
    }
  };

  const handleEmbark = () => {
    socket.emit('embark', { room });
  };

  const handleReady = () => {
      //split by comma and filter empty entries
      const tags = tagsInput.split(',').filter(t => t.trim().length > 0);

      if(tags.length === 0) {
          setStatusMsg("Define your character tags.");
          return;
      }
      if(tags.length > 5) {
          setStatusMsg("Too many tags (Max 5).");
          return;
      }
      if(!ambitionInput.trim()) {
          setStatusMsg("Define your ambition.");
          return;
      }

      setIsReady(true);
      socket.emit('player_ready', { 
          room, 
          description: userDescription, // send the visual description
          tags: tags,
          ambition: ambitionInput,
          secret: secretInput
      });
  };

  const sendAction = () => {
    if (inputValue.trim()) {
      socket.emit('player_action', { username, room, message: inputValue });
      setInputValue('');
    }
  };

  // Determine if Embark button is clickable
  const allPlayersReady = partyStats.length > 0 && partyStats.every(p => p.is_ready);

  if (gameState === 'login') {
    return (
      <div className="login-container">
        <h1>GAOL</h1>
        
        <div className="login-box">
          
          <div className="toggle-bar">
             <button 
               className={`toggle-btn ${loginMode === 'join' ? 'active' : ''}`}
               onClick={()=>setLoginMode('join')}
             >
               JOIN ROOM
             </button>
             <button 
               className={`toggle-btn ${loginMode === 'create' ? 'active' : ''}`}
               onClick={()=>setLoginMode('create')}
             >
               CREATE ROOM
             </button>
          </div>

          <div className="form-row">
            <label className="login-label">Username</label>
            <input placeholder="e.g. Shadowhawk30" onChange={e => setUsername(e.target.value)} />
          </div>

          <div className="form-row">
            <label className="login-label">Room Code</label>
            <input placeholder="e.g. 1987" onChange={e => setRoom(e.target.value)} />
          </div>

          {loginMode === 'create' && (
            <>
              <div className="form-row">
                <label className="login-label">World</label>
                <select 
                  onChange={e => setSelectedWorld(e.target.value)} 
                  value={selectedWorld}
                >
                  {availableWorlds.map(w => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                  <option value="NEW">+ Create New World</option>
                </select>
              </div>

              {selectedWorld === 'NEW' && (
                 <>
                   <div className="form-row">
                     <label className="login-label">New World Name</label>
                     <input 
                        placeholder="e.g. Middle Earth" 
                        onChange={e => setNewWorldName(e.target.value)} 
                     />
                   </div>
                   <div className="form-row">
                    <label className="login-label">Setting</label>
                    <input 
                      placeholder="e.g. High Fantasy" 
                      onChange={e => setSetting(e.target.value)} 
                    />
                  </div>
                  
                  <div className="form-row">
                    <label className="login-label">Realism</label>
                    <select onChange={e => setRealism(e.target.value)} value={realism}>
                      <option value="High">High</option>
                      <option value="Mid">Mid</option>
                      <option value="Low">Low</option>
                    </select>
                  </div>
                 </>
              )}
            </>
          )}

          <button 
            className="action-btn"
            onClick={loginMode === 'join' ? handleJoin : handleCreate}
          >
            {loginMode === 'join' ? 'ENTER' : 'INITIALIZE'}
          </button>
          
          <div style={{color:'red', marginTop:'10px', fontSize:'0.8rem', textAlign:'center'}}>
            {statusMsg !== 'System Ready...' ? statusMsg : ''}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="main-layout">
      
      {/* Left side, submission box, chat log, and ticker */}
      <div className="left-panel">
        
        {/* Top Ticker - added check for thinking status */}
        <div className={`status-ticker ${statusMsg.includes('THINKING') ? 'thinking' : ''}`}>
           STATUS: {statusMsg} | WORLD: {currentWorldName}
        </div>

        {/* Chat Log */}
        <div className="chat-window">
            {/* Embark button appears only for Admin, before messages exist (game start) */}
            {messages.length === 0 && isAdmin && (
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
            
            {/* If not admin and waiting, show message */}
            {messages.length === 0 && !isAdmin && (
                <div className="embark-overlay">
                    <div style={{color:'#666', fontStyle:'italic'}}>
                        {isReady ? "Waiting for host to start..." : "Fill out character sheet..."}
                    </div>
                </div>
            )}

          {messages.map((m, i) => (
            <div key={i} className={`message-block ${m.sender === 'Gaol' ? 'gaol-msg' : 'player-msg'}`}>
              <div className="msg-header">
                {m.sender === 'Gaol' ? 'GAOL:' : 'Actions:'}
              </div>
              <div className="msg-body">
                {m.sender !== 'Gaol' && <span className="player-name">{m.sender}<br></br></span>}
                {m.text}
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        {/* Bottom Input */}
        <div className="input-area">
          <span className="prompt-arrow">{'>'}</span>
          <input 
            value={inputValue} 
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendAction()}
            placeholder="Describe your action..."
            disabled={messages.length === 0} // Disable chat until game starts
          />
        </div>
      </div>

      {/* Party Grid and Character Sheet */}
      <div className="right-panel">
        
        {/* Party Grid */}
        <div className="party-grid">
          {partyStats.map((p, i) => (
            <div key={i} className="mini-card">
              <div className="mini-name">#{i+1} {p.name}</div>
              <div className="mini-stat">HP: {p.hp}</div>
              <div className="mini-stat">{p.status}</div>
              {/* Show Ready if they have Acted (Turn) or are Ready (Lobby) */}
              {/* Only show Lobby Ready if NO messages (game hasn't started) */}
              {((messages.length === 0 && p.is_ready) || (messages.length > 0 && p.has_acted)) && (
                  <div className="ready-indicator">READY</div>
              )}
            </div>
          ))}
          {[...Array(Math.max(0, 6 - partyStats.length))].map((_, i) => (
            <div key={`empty-${i}`} className="mini-card empty">
              <span className="empty-slot">EMPTY</span>
            </div>
          ))}
        </div>

        {/* Detail View with Tabs */}
        <div className="detail-view">
          
          <div className="tab-bar">
             <button 
               className={`tab-btn ${activeTab === 'character' ? 'active' : ''}`}
               onClick={() => setActiveTab('character')}
             >
               CHARACTER SHEET
             </button>
             <button 
               className={`tab-btn ${activeTab === 'world' ? 'active' : ''}`}
               onClick={() => setActiveTab('world')}
             >
               WORLD SHEET
             </button>
          </div>

          {activeTab === 'character' ? (
              // CHARACTER SHEET
              <>
                <div className="detail-row">
                    <div className="detail-header">
                        <h2>{myStats.name}</h2>
                        <div className="detail-stats">
                            <div>Health: {myStats.hp} / 100</div>
                            <div>Status: {myStats.status}</div>
                        </div>
                    </div>
                    <div className="portrait-small">
                        {setting ? setting[0] : '?'}{realism ? realism[0] : '?'}
                    </div>
                </div>
                
                {/* Two Column Layout */}
                <div className="sheet-columns">
                    
                    {/* LEFT: Description (AI Updates) */}
                    <div className="sheet-left">
                        {/* CHANGED LABEL BELOW */}
                        <label style={{fontSize:'0.7rem', color:'#666', marginBottom:'5px'}}>CHARACTER SUMMARY</label>
                        <textarea 
                            style={{flexGrow:1, resize:'none'}}
                            placeholder="Briefly describe your character..." 
                            value={userDescription}
                            onChange={e => setUserDescription(e.target.value)}
                            disabled={isReady} 
                        />
                    </div>

                    {/* RIGHT: User Entries */}
                    <div className="sheet-right">
                        
                        {/* TAGS INPUT */}
                        <div style={{marginBottom: '10px'}}>
                            <div style={{display:'flex', justifyContent:'space-between'}}>
                                <label style={{fontSize:'0.7rem', color:'#666'}}>TAGS</label>
                                <span className="input-instruction">Max 5</span>
                            </div>
                            <input 
                                className="sheet-input"
                                placeholder="e.g. Human, Warrior, Strong" 
                                value={tagsInput}
                                onChange={e => setTagsInput(e.target.value)}
                                disabled={isReady} 
                            />
                        </div>

                        {/* AMBITION INPUT */}
                        <div style={{marginBottom: '10px'}}>
                            <label style={{fontSize:'0.7rem', color:'#666'}}>AMBITION</label>
                            <input 
                                className="sheet-input"
                                placeholder="e.g. Become King" 
                                value={ambitionInput}
                                onChange={e => setAmbitionInput(e.target.value)}
                                disabled={isReady} 
                            />
                        </div>

                        {/* SECRET INPUT */}
                        <div style={{flexGrow: 1, display:'flex', flexDirection:'column', marginBottom:'10px'}}>
                            <label style={{fontSize:'0.7rem', color:'#666'}}>SECRET</label>
                            <textarea 
                                style={{flexGrow:1, background:'#000', border:'1px solid #333', color:'var(--text-main)', padding:'8px', outline:'none', resize:'none', fontSize:'0.9rem'}}
                                placeholder="Hidden info..." 
                                value={secretInput}
                                onChange={e => setSecretInput(e.target.value)}
                                disabled={isReady} 
                            />
                        </div>

                        {/* READY BUTTON */}
                        {!isReady ? (
                            <button className="ready-btn" onClick={handleReady} style={{width:'100%', padding:'10px'}}>
                                CONFIRM & READY
                            </button>
                        ) : (
                            <div style={{textAlign:'center', color:'var(--terminal-green)', border:'1px solid var(--terminal-green)', padding:'5px', fontSize:'0.8rem', fontWeight:'bold'}}>
                                LOCKED IN
                            </div>
                        )}

                    </div>
                </div>
              </>
          ) : (
              // WORLD SHEET
              <div className="world-sheet">
                 {worldData ? (
                     <>
                        <div className="world-header">
                            <h2>{worldData.name}</h2>
                            <div className="world-meta">
                                <span>{worldData.setting}</span> | <span>{worldData.realism} Realism</span>
                            </div>
                        </div>
                        <div className="world-desc">
                            {worldData.description}
                        </div>
                        <div className="world-events-title">MAJOR EVENTS</div>
                        <div className="world-events-list">
                            {worldData.major_events && worldData.major_events.length > 0 ? (
                                worldData.major_events.map((e, i) => (
                                    <div key={i} className="event-item">
                                        - {e}
                                    </div>
                                ))
                            ) : (
                                <div style={{color:'#555'}}>No major history yet.</div>
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
    </div>
  );
}

export default App;