import { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import './App.css';

//connection to the flask backend, uses undefined for production relative path
const SOCKET_URL = import.meta.env.PROD ? undefined : 'http://localhost:5000';
const socket = io(SOCKET_URL);

function App() {
  //tracks if user is in 'login' screen or 'playing' the game
  const [gameState, setGameState] = useState('login'); 
  //toggles between 'join' existing room or 'create' new room forms
  const [loginMode, setLoginMode] = useState('join'); 

  //basic user inputs for authentication
  const [username, setUsername] = useState('');
  const [room, setRoom] = useState('');
  //Password states
  const [createPassword, setCreatePassword] = useState('');
  const [joinPassword, setJoinPassword] = useState('');
  const [showPwdModal, setShowPwdModal] = useState(false);
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
  
  //tracks which character sheet is currently being viewed
  const [selectedPlayer, setSelectedPlayer] = useState(null); 

  //character sheet form states
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
  
  //New World Size Parameter
  const [worldSize, setWorldSize] = useState('Medium');

  //state for Custom API Key
  const [customApiKey, setCustomApiKey] = useState('');
  //track if server has a default key (null = loading)
  const [serverHasKey, setServerHasKey] = useState(null);

  //gameplay data containers
  const [messages, setMessages] = useState([]);
  const [partyStats, setPartyStats] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [statusMsg, setStatusMsg] = useState('System Ready...');
  //visual state for the d20 roll
  const [lastRoll, setLastRoll] = useState(null);
  
  //admin override state
  const [overrideText, setOverrideText] = useState('');
  const [showOverrideModal, setShowOverrideModal] = useState(false); // Updated to Modal Toggle
  
  //toggles right panel view between character sheet and world info
  const [activeTab, setActiveTab] = useState('character'); 
  //toggles sub-tabs within the world sheet
  const [worldTab, setWorldTab] = useState('history');

  //state for about modal
  const [showAbout, setShowAbout] = useState(false);

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

  const [showKickModal, setShowKickModal] = useState(false);
  const [kickTarget, setKickTarget] = useState('');

  //checks local storage for a previously saved api key on mount
  useEffect(() => {
    const savedKey = localStorage.getItem('gaol_api_key');
    if (savedKey) {
        setCustomApiKey(savedKey);
    }
    
    //attempt to rejoin if a session exists in local storage
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
  }, []);

  //sets up all socket event listeners
  useEffect(() => {
    //listens for incoming chat messages
    socket.on('message', (data) => setMessages((prev) => [...prev, data]));
    //updates the top status ticker
    socket.on('status', (data) => setStatusMsg(data.msg));
    //updates the list of players and their stats
    socket.on('game_state_update', (data) => setPartyStats(data));
    
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

    //handles successful room entry, switching view to game
    socket.on('join_success', (data) => {
      setRoom(data.room);
      setCurrentWorldName(data.world);
      setWorldData(data.world_details); 
      setIsAdmin(data.is_admin); 
      if(data.history && data.history.length > 0) setMessages(data.history);
      setGameState('playing');
      setJoinPassword(''); // clear password on success
      setShowPwdModal(false);
      setIsEmbarking(false); // reset embark state
      setShowOverrideModal(false); // reset override state
      
      localStorage.setItem('gaol_session', JSON.stringify({ username: username, room: data.room }));
    });

    //handle room closure by host
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

    //updates world lore/events when ai triggers a change
    socket.on('world_update', (data) => setWorldData(data));

    //Password Requirement Trigger
    socket.on('password_required', (data) => {
        setPendingRoom(data.room);
        setStatusMsg("Restricted Access: Password Required.");
        setShowPwdModal(true);
    });

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
        localStorage.removeItem('gaol_session'); //clear session
    });

    //handle admin status update (transfer)
    socket.on('admin_update', (data) => {
        if(data.is_admin) {
            setIsAdmin(true);
            setStatusMsg("You are now the Admin.");
        } else {
            setIsAdmin(false);
            setStatusMsg("Admin privileges revoked.");
        }
    });

    //request initial data on mount
    socket.emit('get_worlds');
    
    //request rooms immediately
    socket.emit('get_rooms');
    
    //Set up polling interval for rooms list (every 3 seconds)
    const roomPollInterval = setInterval(() => {
        if(gameState === 'login') {
            socket.emit('get_rooms');
        }
    }, 3000);

    //cleanup listeners on unmount
    return () => { 
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
  }, [gameState, username]); //dependency on gameState ensuring interval respects login status

  //auto-scrolls to the bottom of chat when new messages arrive
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  //helper to find the current user's stats object
  const myStats = partyStats.find(p => p.name === username) || { 
    name: username, hp: 100, status: 'Alive', description: '', tags: [], ambition: '', secret: ''
  };

  //syncs local form state with incoming server data for the user
  useEffect(() => {
      if(isReady) {
          if(myStats.description) setUserDescription(myStats.description);
          if(myStats.tags) setTagsInput(myStats.tags.join(', '));
          if(myStats.ambition) setAmbitionInput(myStats.ambition);
      }
  }, [myStats.description, myStats.tags, myStats.ambition, isReady]);

  //defaults the selected player view to the user on login
  useEffect(() => {
    if(username && !selectedPlayer) setSelectedPlayer(username);
  }, [username, selectedPlayer]);

  //determines which player to show in the right panel
  const displayedPlayer = partyStats.find(p => p.name === selectedPlayer) || myStats;
  //boolean to check if user is viewing their own sheet
  const isOwnSheet = displayedPlayer.name === username;

  //handles standard room joining logic
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
  
  //cleanly handle the leave room button
  const handleLeave = () => {
      if(room) {
          socket.emit('leave_room', { room });
      }
      // Reset local state
      setGameState('login');
      setRoom('');
      setMessages([]);
      setPartyStats([]);
      setIsReady(false);
      setIsAdmin(false);
      setStatusMsg("Disconnected.");
      localStorage.removeItem('gaol_session'); // clear session explicitly
  };

  //Submit password from modal
  const handlePasswordSubmit = () => {
      if(pendingRoom && username) {
          socket.emit('join', { username, room: pendingRoom, password: joinPassword });
          // Note: we don't close modal here immediately, we wait for join_success or another error
      }
  };

  //handles joining via the lobby list buttons
  const handleQuickJoin = (targetRoomId) => {
      if(!username.trim()) {
          setStatusMsg("ERROR: Enter a username first.");
          return;
      }
      setRoom(targetRoomId); 
      socket.emit('join', { username, room: targetRoomId });
      setSelectedPlayer(username);
  };

  //handles room creation including validation of api keys
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

    //saves custom key to local storage for convenience
    if (hasCustom) {
        localStorage.setItem('gaol_api_key', customApiKey);
    }

    //calculate Resolution based on size selection (2:1 Ratio Enforced)
    let mapWidth = 1024;
    let mapHeight = 512;
    
    if(worldSize === 'Small') {
        mapWidth = 512;
        mapHeight = 256;
    } else if(worldSize === 'Large') {
        mapWidth = 2048;
        mapHeight = 1024;
    }

    const finalWorldSelection = selectedWorld || 'NEW';
    socket.emit('create_room', {
      username,
      room,
      setting,
      realism,
      world_selection: finalWorldSelection,
      new_world_name: newWorldName,
      custom_api_key: customApiKey,
      password: createPassword, // Optional password
      width: mapWidth,
      height: mapHeight
    });
    setSelectedPlayer(username);
  };

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

  //submits character sheet data to the server
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

  //sends player chat/action to server and rolls a client-side die
  const sendAction = () => {
    if (inputValue.trim()) {
      const roll = Math.floor(Math.random() * 20) + 1;
      setLastRoll(roll);

      socket.emit('player_action', { username, room, message: inputValue, roll: roll });
      setInputValue('');
    }
  };

  //sends admin override to server
  const sendOverride = () => {
      if (overrideText.trim()) {
          socket.emit('submit_override', { room, text: overrideText });
          setOverrideText('');
          setShowOverrideModal(false); // return to normal view
      }
  };

  //handles admin changing the model
  const handleModelChange = (modelName) => {
      socket.emit('change_model', { room, model: modelName });
      setCurrentModel(modelName);
      setShowModelModal(false);
  };

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

  //kicking a player
  const handleKick = (targetName, e) => {
      e.stopPropagation(); //prevent selecting the card
      setKickTarget(targetName);
      setShowKickModal(true);
  };

  const confirmKick = () => {
       socket.emit('kick_player', { room, target_name: kickTarget });
       setShowKickModal(false);
  };

  //promotion modal
  const handlePromote = (targetName, e) => {
      e.stopPropagation(); //prevent selecting the card
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
  
  //filters for world sheet tabs
  const getDeities = () => {
      if(!worldData || !worldData.entities) return [];
      return worldData.entities.filter(e => 
          e.type.toLowerCase().includes('god') || e.type.toLowerCase().includes('deity')
      );
  };
  
  const getFactions = () => {
      if(!worldData || !worldData.entities) return [];
      return worldData.entities.filter(e => 
          e.type.toLowerCase().includes('faction') || e.type.toLowerCase().includes('guild')
      );
  };

  //helper to aggregate locations from both new system and legacy entities
  const getLocations = () => {
      if(!worldData) return [];
      //get new system locations with coordinates
      return worldData.locations || [];
  };

  //Determine if character sheet prompt should be active (gold particle glow)
  //Active if: Game has not started (messages.length === 0) AND User is not ready AND Viewing Character tab AND Viewing own sheet
  //FIX: Ignore "System" messages (like model changes) so they don't break the pre-game UI
  const nonSystemMessages = messages.filter(m => m.sender !== 'System');
  const showSheetPrompt = !isReady && nonSystemMessages.length === 0 && activeTab === 'character' && isOwnSheet;

  //render logic for the initial login/lobby screen
  if (gameState === 'login') {
    return (
      <div className="login-container">
        
        {/* Left Sidebar for Login */}
        <div className="login-sidebar">
            <h1>GAOL</h1>
            
            <div className="login-box">
              {/* toggles between join and create modes */}
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

              {/* conditional rendering for creation inputs */}
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

                  {/* inputs specific to new world creation */}
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
                      {/* map Scale Selection */}
                      <div className="form-row">
                        <label className="login-label">Map Size</label>
                        <select onChange={e => setWorldSize(e.target.value)} value={worldSize}>
                          <option value="Small">Small (512 x 256)</option>
                          <option value="Medium">Medium (1024 x 512)</option>
                          <option value="Large">Large (2048 x 1024)</option>
                        </select>
                      </div>
                     </>
                  )}
                  
                  {/* Optional Password Field */}
                  <div className="form-row">
                      <label className="login-label">Password (Optional)</label>
                      <input 
                        type="password"
                        placeholder="Leave empty for public"
                        value={createPassword}
                        onChange={e => setCreatePassword(e.target.value)}
                      />
                  </div>

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
              
              {/* error or status feedback */}
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
                                          {/* visual indicators for key availability */}
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
                                              {r.is_private ? "LOCKED" : "JOIN"}
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
        
        {/* right Splash Area Placeholder */}
        <div className="login-splash">
           {/* Splash Content */}
        </div>

        {/* login page Footer */}
        <div className="login-footer">
             <button className="footer-btn" onClick={() => setShowAbout(true)}>ABOUT</button>
             <button className="footer-btn" onClick={() => setStatusMsg("Data features coming soon...")}>DATA</button>
        </div>
        {/* placeholder Text - Opens new tab on click */}
        <div 
            className="login-placeholder" 
            onClick={() => window.open('https://cehodum.wixsite.com/chelsea-portfolio', '_blank')}
        >
            Art by Chelsea Hodum
        </div>

        {/* about Modal */}
        {showAbout && (
             <div className="about-modal-overlay">
                 <div className="about-modal-box">
                      <h2>About GAOL</h2>
                      <div className="about-content">
                        <p>GAOL is a multiplayer AI storyteller experience.</p>
                        <p>Inspired by <i>AI Dungeon</i> and <i>Death by AI</i>, I sought to recreate the multiplayer experience with a rich, evolving world.</p>
                        <p>Create a room, define your setting, and embark on a collaborative storytelling journey with friends.</p>
                        <p><a href="[https://github.com/JonFRutan/GAOL](https://github.com/JonFRutan/GAOL)">GitHub</a> || <a href="[https://www.linkedin.com/in/jonathanrutan/](https://www.linkedin.com/in/jonathanrutan/)">LinkedIn</a> || <a href="[https://jfelix.space](https://jfelix.space)">jfelix</a></p>
                      </div>
                      <button className="join-sm-btn" style={{width: '100%', marginTop: '20px'}} onClick={() => setShowAbout(false)}>CLOSE</button>
                 </div>
             </div>
        )}

        {/* Password Prompt Modal */}
        {showPwdModal && (
            <div className="about-modal-overlay">
                <div className="about-modal-box">
                    <h2>SECURE ROOM</h2>
                    <p style={{color:'#888', marginBottom:'15px'}}>Room {pendingRoom} is password protected.</p>
                    <input 
                        type="password"
                        placeholder="Enter Password"
                        value={joinPassword}
                        onChange={e => setJoinPassword(e.target.value)}
                        style={{
                            width: '100%', padding:'10px', background:'#000', 
                            border:'1px solid var(--accent-gold)', color:'var(--accent-gold)',
                            marginBottom: '20px', textAlign: 'center'
                        }}
                    />
                    <div style={{display:'flex', width:'100%', gap:'10px'}}>
                        <button className="join-sm-btn" style={{flex:1}} onClick={() => setShowPwdModal(false)}>CANCEL</button>
                        <button className="action-btn" style={{flex:1, marginTop:0}} onClick={handlePasswordSubmit}>UNLOCK</button>
                    </div>
                </div>
            </div>
        )}
      </div>
    );
  }

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
          {/* Admin Model Switcher */}
          {isAdmin && (
              <button className="nav-btn model-btn" onClick={() => setShowModelModal(true)} title="Change AI Model">
                 MODEL
              </button>
          )}
          {/* Admin API Key Button (New Feature) */}
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
                        {isReady ? "Waiting for host to start..." : "Fill out character sheet..."}
                    </div>
                </div>
            )}

          {/* chat history mapping */}
          {messages.map((m, i) => (
            <div key={i} className={`message-block ${m.sender === 'Gaol' ? 'gaol-msg' : 'player-msg'}`}>
              <div className="msg-header">
                {m.sender === 'Gaol' ? 'GAOL:' : (m.sender === 'System' ? 'SYS:' : 'Actions:')}
              </div>
              <div className="msg-body" style={{color: m.sender === 'System' ? '#555' : 'inherit', fontStyle: m.sender === 'System' ? 'italic' : 'normal'}}>
                {m.sender !== 'Gaol' && m.sender !== 'System' && <span className="player-name">{m.sender}<br></br></span>}
                {m.text}
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
            placeholder="Describe your action..."
            /* FIX: Filter out System messages so model changes don't enable chat too early */
            disabled={nonSystemMessages.length === 0} 
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
                                {/* secrets are hidden for other players */}
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
                            {/* confirm button logic */}
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
                        <div className="world-desc">
                            {worldData.description}
                        </div>
                        
                        {/* World Sub-Tabs */}
                        <div className="sub-tab-bar">
                            <button className={`sub-tab-btn ${worldTab === 'history' ? 'active' : ''}`} onClick={()=>setWorldTab('history')}>HISTORY</button>
                            <button className={`sub-tab-btn ${worldTab === 'locations' ? 'active' : ''}`} onClick={()=>setWorldTab('locations')}>LOCATIONS</button>
                            <button className={`sub-tab-btn ${worldTab === 'gods' ? 'active' : ''}`} onClick={()=>setWorldTab('gods')}>DEITIES</button>
                            <button className={`sub-tab-btn ${worldTab === 'factions' ? 'active' : ''}`} onClick={()=>setWorldTab('factions')}>FACTIONS</button>
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

                            {worldTab === 'gods' && (
                                getDeities().length > 0 ? (
                                    getDeities().map((e, i) => (
                                        <div key={i} className="entity-item">
                                            <div className="entity-name">{e.name}</div>
                                            <div className="entity-type">{e.type}</div>
                                            <div className="entity-desc">{e.description}</div>
                                        </div>
                                    ))
                                ) : <div style={{color:'#555'}}>No deities known.</div>
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
                        </div>
                     </>
                 ) : (
                     <div>Loading world data...</div>
                 )}
              </div>
          )}
        </div>
      </div>
      
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

export default App;