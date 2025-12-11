import { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import './App.css';

const SOCKET_URL = import.meta.env.PROD ? undefined : 'http://localhost:5000';
const socket = io(SOCKET_URL);

function App() {
  const [gameState, setGameState] = useState('login'); 
  const [loginMode, setLoginMode] = useState('join'); 

  const [username, setUsername] = useState('');
  const [room, setRoom] = useState('');
  
  const [activeRooms, setActiveRooms] = useState([]);

  //world tracking
  const [currentWorldName, setCurrentWorldName] = useState('');
  const [worldData, setWorldData] = useState(null); 
  
  const [isAdmin, setIsAdmin] = useState(false); 
  const [isReady, setIsReady] = useState(false); 
  
  const [selectedPlayer, setSelectedPlayer] = useState(null); 

  const [userDescription, setUserDescription] = useState(''); 
  const [tagsInput, setTagsInput] = useState('');
  const [ambitionInput, setAmbitionInput] = useState('Unknown');
  const [secretInput, setSecretInput] = useState('');

  //creation parameters
  const [setting, setSetting] = useState('Medieval Fantasy');
  const [realism, setRealism] = useState('High');
  const [selectedWorld, setSelectedWorld] = useState('');
  const [newWorldName, setNewWorldName] = useState('');
  const [availableWorlds, setAvailableWorlds] = useState([]);
  //state for Custom API Key
  const [customApiKey, setCustomApiKey] = useState('');
  //track if server has a default key (null = loading)
  const [serverHasKey, setServerHasKey] = useState(null);

  const [messages, setMessages] = useState([]);
  const [partyStats, setPartyStats] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [statusMsg, setStatusMsg] = useState('System Ready...');
  const [lastRoll, setLastRoll] = useState(null);
  
  const [activeTab, setActiveTab] = useState('character'); 

  const chatEndRef = useRef(null);

  useEffect(() => {
    const savedKey = localStorage.getItem('gaol_api_key');
    if (savedKey) {
        setCustomApiKey(savedKey);
    }
  }, []);

  useEffect(() => {
    socket.on('message', (data) => setMessages((prev) => [...prev, data]));
    socket.on('status', (data) => setStatusMsg(data.msg));
    socket.on('game_state_update', (data) => setPartyStats(data));
    
    socket.on('world_list', (data) => {
        setAvailableWorlds(data);
        if(data.length > 0) setSelectedWorld(data[0].id);
        else setSelectedWorld('NEW');
    });
    
    //listen for server config to know if .env key exists
    socket.on('server_config', (data) => {
        setServerHasKey(data.has_env_key);
    });

    socket.on('room_list', (data) => {
        setActiveRooms(data);
    });

    socket.on('join_success', (data) => {
      setRoom(data.room);
      setCurrentWorldName(data.world);
      setWorldData(data.world_details); 
      setIsAdmin(data.is_admin); 
      if(data.history && data.history.length > 0) setMessages(data.history);
      setGameState('playing');
    });

    socket.on('world_update', (data) => setWorldData(data));

    socket.emit('get_worlds');
    socket.emit('get_rooms');

    return () => { 
      socket.off('message'); 
      socket.off('status'); 
      socket.off('game_state_update'); 
      socket.off('world_list');
      socket.off('server_config');
      socket.off('room_list');
      socket.off('join_success');
      socket.off('world_update');
    };
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const myStats = partyStats.find(p => p.name === username) || { 
    name: username, hp: 100, status: 'Alive', description: '', tags: [], ambition: '', secret: ''
  };

  useEffect(() => {
      if(isReady) {
          if(myStats.description) setUserDescription(myStats.description);
          if(myStats.tags) setTagsInput(myStats.tags.join(', '));
          if(myStats.ambition) setAmbitionInput(myStats.ambition);
      }
  }, [myStats.description, myStats.tags, myStats.ambition, isReady]);

  useEffect(() => {
    if(username && !selectedPlayer) setSelectedPlayer(username);
  }, [username, selectedPlayer]);

  const displayedPlayer = partyStats.find(p => p.name === selectedPlayer) || myStats;
  const isOwnSheet = displayedPlayer.name === username;

  const handleJoin = () => {
    if(!username.trim()) {
        setStatusMsg("ERROR: Username required.");
        return;
    }
    if (username && room) {
      socket.emit('join', { username, room });
      setSelectedPlayer(username);
    }
  };

  const handleQuickJoin = (targetRoomId) => {
      if(!username.trim()) {
          setStatusMsg("ERROR: Enter a username first.");
          return;
      }
      setRoom(targetRoomId); 
      socket.emit('join', { username, room: targetRoomId });
      setSelectedPlayer(username);
  };

  const handleCreate = () => {
    if (!username || !room) {
        setStatusMsg("ERROR: Username and Room Code required.");
        return;
    }
    
    //strict API key validation
    //use custom key if present, otherwise rely on server key.
    //if NO custom key AND NO server key, block creation.
    const hasCustom = customApiKey && customApiKey.trim().length > 10;
    
    //default to false for safety if server config hasn't loaded yet
    const safeServerHasKey = serverHasKey === true;
    
    if (!hasCustom && !safeServerHasKey) {
        setStatusMsg("REQUIRED: Enter API Key (Server has no default).");
        return;
    }

    if (hasCustom) {
        localStorage.setItem('gaol_api_key', customApiKey);
    }

    const finalWorldSelection = selectedWorld || 'NEW';
    socket.emit('create_room', {
      username,
      room,
      setting,
      realism,
      world_selection: finalWorldSelection,
      new_world_name: newWorldName,
      custom_api_key: customApiKey 
    });
    setSelectedPlayer(username);
  };

  const handleEmbark = () => {
    socket.emit('embark', { room });
  };

  const handleReady = () => {
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

  const sendAction = () => {
    if (inputValue.trim()) {
      const roll = Math.floor(Math.random() * 20) + 1;
      setLastRoll(roll);

      socket.emit('player_action', { username, room, message: inputValue, roll: roll });
      setInputValue('');
    }
  };

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
            <input 
                placeholder="e.g. 1987" 
                value={room} 
                onChange={e => setRoom(e.target.value)} 
            />
          </div>

          {loginMode === 'create' && (
            <>
              <div className="form-row">
                <label className="login-label">World</label>
                <select onChange={e => setSelectedWorld(e.target.value)} value={selectedWorld}>
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
                     <input placeholder="e.g. Middle Earth" onChange={e => setNewWorldName(e.target.value)} />
                   </div>
                   <div className="form-row">
                    <label className="login-label">Setting</label>
                    <input placeholder="e.g. High Fantasy" onChange={e => setSetting(e.target.value)} />
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

              {/* Custom API Key Input */}
              <div className="form-row">
                <label className="login-label" style={{color: 'var(--terminal-green)'}}>
                  Gemini API Key
                </label>
                <input 
                    placeholder={serverHasKey ? "Server Key Active (Optional)" : "REQUIRED"}
                    value={customApiKey}
                    onChange={e => setCustomApiKey(e.target.value)}
                    type="password"
                    style={{
                        borderColor: (!customApiKey && !serverHasKey) ? 'var(--alert-red)' : 'var(--accent-dim)'
                    }}
                />
              </div>
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

          {/* Active Rooms Table */}
          {loginMode === 'join' && activeRooms.length > 0 && (
              <div className="room-list-container">
                  <h3>Available Rooms</h3>
                  <table className="room-table">
                      <thead>
                          <tr>
                              <th>ID</th>
                              <th>World</th>
                              <th>#</th>
                              <th>API</th>
                              <th>Action</th>
                          </tr>
                      </thead>
                      <tbody>
                          {activeRooms.map(r => (
                              <tr key={r.id}>
                                  <td style={{color: 'var(--accent-gold)'}}>{r.id}</td>
                                  <td>{r.world}</td>
                                  <td>{r.player_count}/6</td>
                                  <td>
                                      {r.has_custom_key ? (
                                          <span style={{color:'var(--terminal-green)', fontWeight:'bold'}}>SELF</span>
                                      ) : (
                                          serverHasKey ? (
                                              <span style={{color:'#444'}}>SYS</span>
                                          ) : (
                                              <span style={{color:'var(--alert-red)', fontWeight:'bold'}}>ERR</span>
                                          )
                                      )}
                                  </td>
                                  <td style={{textAlign:'right'}}>
                                      <button 
                                          className="join-sm-btn"
                                          onClick={() => handleQuickJoin(r.id)}
                                      >
                                          JOIN
                                      </button>
                                  </td>
                              </tr>
                          ))}
                      </tbody>
                  </table>
              </div>
          )}

        </div>
      </div>
    );
  }

  return (
    <div className="main-layout">
      {/* Left side */}
      <div className="left-panel">
        <div className={`status-ticker ${statusMsg.includes('THINKING') ? 'thinking' : ''}`}>
           STATUS: {statusMsg} | WORLD: {currentWorldName}
        </div>

        <div className="chat-window">
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

        <div className="input-area">
          <span className="prompt-arrow">{'>'}</span>
          <input 
            value={inputValue} 
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendAction()}
            placeholder="Describe your action..."
            disabled={messages.length === 0} 
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

      {/* Right side */}
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
              <>
                <div className="detail-row">
                    <div className="detail-header">
                        <h2>{displayedPlayer.name}</h2>
                        <div className="detail-stats">
                            <div>Health: {displayedPlayer.hp} / 100</div>
                            <div>Status: {displayedPlayer.status}</div>
                        </div>
                    </div>
                    <div className="portrait-small">
                        {setting ? setting[0] : '?'}{realism ? realism[0] : '?'}
                    </div>
                </div>
                
                <div className="sheet-columns">
                    <div className="sheet-left">
                        <label style={{fontSize:'0.7rem', color:'#666', marginBottom:'5px'}}>CHARACTER SUMMARY</label>
                        <textarea 
                            style={{flexGrow:1, resize:'none'}}
                            placeholder="Briefly describe your character..." 
                            value={isOwnSheet ? userDescription : (displayedPlayer.description || '')}
                            onChange={e => isOwnSheet && setUserDescription(e.target.value)}
                            disabled={!isOwnSheet || (isOwnSheet && isReady)} 
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
                                disabled={!isOwnSheet || (isOwnSheet && isReady)} 
                            />
                        </div>
                        <div style={{marginBottom: '10px'}}>
                            <label style={{fontSize:'0.7rem', color:'#666'}}>AMBITION</label>
                            <input 
                                className="sheet-input"
                                placeholder="e.g. Become King" 
                                value={isOwnSheet ? ambitionInput : (displayedPlayer.ambition || '')}
                                onChange={e => isOwnSheet && setAmbitionInput(e.target.value)}
                                disabled={!isOwnSheet || (isOwnSheet && isReady)} 
                            />
                        </div>
                        <div style={{flexGrow: 1, display:'flex', flexDirection:'column', marginBottom:'10px'}}>
                            <label style={{fontSize:'0.7rem', color:'#666'}}>SECRET</label>
                            {isOwnSheet ? (
                                <textarea 
                                    style={{flexGrow:1, background:'#000', border:'1px solid #333', color:'var(--text-main)', padding:'8px', outline:'none', resize:'none', fontSize:'0.9rem'}}
                                    placeholder="Hidden info..." 
                                    value={secretInput}
                                    onChange={e => setSecretInput(e.target.value)}
                                    disabled={isReady} 
                                />
                            ) : (
                                <div className="secret-mask">
                                    What secrets may {displayedPlayer.name} hold?
                                </div>
                            )}
                        </div>
                        {isOwnSheet && (
                            !isReady ? (
                                <button className="ready-btn" onClick={handleReady} style={{width:'100%', padding:'10px'}}>
                                    CONFIRM & READY
                                </button>
                            ) : (
                                <div style={{textAlign:'center', color:'var(--terminal-green)', border:'1px solid var(--terminal-green)', padding:'5px', fontSize:'0.8rem', fontWeight:'bold'}}>
                                    LOCKED IN
                                </div>
                            )
                        )}
                    </div>
                </div>
              </>
          ) : (
              <div className="world-sheet">
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
