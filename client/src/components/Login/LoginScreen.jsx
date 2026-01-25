import { useState, useEffect } from 'react';

export default function LoginScreen({auth, setAuth, ui, setUi, socket, activeRooms, availableWorlds }) {
    //consts
    const [mode, setMode] = useState('join');               //used for controlling which modal the user is viewing. Defaults to the join page with the list of rooms
    const [overlayMode, setOverlayMode] = useState('');     //overlay mode which can coexist atop normal modals. Used by 'about', 'customize', and 'data'
    const [selectedWorld, setSelectedWorld] = useState('');
    const [joinPassword, setJoinPassword] = useState('');
    const [creationForm, setCreationForm] = useState ({
        //login/creation form    
        password: '',                      //optional room password
        worldId: '',                       //unique world ID
        newWorldName: '',                  
        setting: '',                       //basic description of the world environment
        realism: 'High',                   //how realistic the world should behave
        size: 'Medium'                     //size of the world (small, medium, large)
    });

    useEffect(() => {
        // Listen for the server asking for a password
        socket.on('password_required', (data) => {
            setUi(prev => ({ ...prev, pendingRoom: data.room })); // Store which room is locked
            setMode('password'); // Switch local mode to show the password modal
        });

        return () => {
            socket.off('password_required');
        };
    }, []);
    
    useEffect(() => {
        if (availableWorlds != {}) {
            setSelectedWorld(Object.keys(availableWorlds)[0]);
        }
      }, []); // the empty array at the end here tells use it only runs once at the very start.

    //status updating, hooks up to the setUI.
    const setStatus = (msg) => {
        setUi(prev => ({ ...prev, statusMsg: msg }));
    }

    //handles room joining
    const handleJoin = () => {
        if (!auth.username) { setStatus("Username required."); return; }
        if (!auth.room) { setStatus("Room Code required."); return; }

        if (auth.username && auth.room) {
            socket.emit('join', { username: auth.username, room: auth.room });
        }
    };

    // Handler for the join buttons on the room table
    const handleQuickJoin = (targetRoomId) => {
        if (!auth.username.trim()) {
            setStatus("ERROR: Enter a username first.");
            return;
        }
        //update the global auth state then emit
        setAuth(prev => ({ ...prev, room: targetRoomId }));
        socket.emit('join', { username: auth.username, room: targetRoomId });
    };

    //handles the room creation
    const handleCreate = () => {
        if (!auth.username || !auth.room) {
            setStatus("Username and Room Code required.");
            return;
        }
        //calculate map dimensions based on the 'size' string, default is medium with the following values
        let mapWidth = 1024;
        let mapHeight = 512;
        if (creationForm.size === 'Small') { mapWidth = 512; mapHeight = 256; }
        else if (creationForm.size === 'Large') { mapWidth = 2048; mapHeight = 1024; }
        const finalWorldSelection = selectedWorld || 'NEW';

        //sends a message to the server to create a room
        socket.emit('create_room', {
            username: auth.username,
            room: auth.room,
            setting: creationForm.setting,
            realism: creationForm.realism,
            world_selection: finalWorldSelection,
            new_world_name: creationForm.newWorldName,
            custom_api_key: auth.apiKey,
            password: creationForm.password,
            width: mapWidth,
            height: mapHeight
        });
    };

    //rendering
    return (
      <div className="login-container">
        {/* Left Sidebar for Login */}
        <div className="login-sidebar">
            {mode === 'join' && (
                <>
                <img className="thumbnail-image" src="/GaolIcon.png"></img>
                <h1>GAOL</h1>
                </>
              )}
            {(mode === 'create') && (
                <>
                <h1 style={{fontSize:'2rem'}}>GAOL</h1>
                </>
              )}
            <div className="login-box">
              {/* toggles between join and create modes */}
              <div className="toggle-bar">
                 <button 
                   className={`toggle-btn ${mode === 'join' ? 'active' : ''}`}
                   onClick={()=>setMode('join')}
                 >
                   JOIN ROOM
                 </button>
                 <button 
                   className={`toggle-btn ${mode === 'create' ? 'active' : ''}`}
                   onClick={()=>setMode('create')}
                 >
                   CREATE ROOM
                 </button>
              </div>

              <div className="form-row">
                <label className="login-label">Username</label>
                <input placeholder="e.g. Shadowhawk30" value={auth.username} onChange={(e) => setAuth({...auth, username: e.target.value})} />
              </div>

              <div className="form-row">
                <label className="login-label">Room Code</label>
                <input 
                    placeholder="e.g. 1987" 
                    value={auth.room} 
                    onChange={e => setAuth({...auth, room: e.target.value})} 
                />
              </div>

              {/* conditional rendering for creation inputs */} 
              {(mode === 'create') && (
                <>
                  {/* optional password field */}
                  <div className="form-row">
                      <label className="login-label">Password (Optional)</label>
                      <input 
                        type="password"
                        placeholder="Leave empty for public"
                        value={creationForm.password}
                        onChange={e => setCreationForm({...creationForm, password: e.target.value})}
                      />
                  </div>

                  {/* custom API key input */}
                  <div className="form-row">
                    <label className="login-label" style={{color: 'var(--terminal-green)'}}>
                      Gemini API Key
                    </label>
                    <input 
                        placeholder={auth.serverHasKey ? "Server Key Active (Optional)" : "REQUIRED"}
                        value={auth.apiKey}
                        onChange={e => setAuth({...auth, apiKey: e.target.value})}
                        type="password"
                        style={{
                            borderColor: (!auth.apiKey && auth.serverHasKey) ? 'var(--alert-red)' : 'var(--accent-dim)'
                        }}
                    />
                  </div>
                  
                  {/* spacer to push world selection to bottom */}
                  <div style={{height: '20px'}}></div>

                  {/* World Selection */}
                  <div className="form-row">
                    <label className="login-label">World</label>
                    <select onChange={e => setSelectedWorld(e.target.value)} value={selectedWorld}>
                      {availableWorlds.map(w => (
                          <option key={w.id} value={w.id}>{w.name}</option>
                      ))}
                      {/* updates label to show the user's custom name if entered */}
                      <option value="NEW">
                          {creationForm.newWorldName ? `[NEW] ${creationForm.newWorldName}` : "+ Create New World"}
                      </option>
                    </select>
                  </div>
                  
                  {/* Dynamic World Info Card */}
                  <div className="world-info-card">
                      {selectedWorld === 'NEW' ? (
                          <>
                              <div className="world-card-title">
                                  {creationForm.newWorldName || "NEW WORLD"}
                              </div>
                              <div className="world-card-meta">
                                  <span>{creationForm.realism} Realism</span>
                                  <span>{creationForm.size} Map</span>
                              </div>
                              <div className="world-card-desc">
                                  {creationForm.setting || "No setting description provided..."}
                              </div>
                          </>
                      ) : (
                        /* Logic to display existing world details */
                        (() => {
                           const w = availableWorlds.find(w => w.id === selectedWorld);
                           if(!w) return null;
                           return (
                              <>
                                <div className="world-card-title">{w.name}</div>
                                <div className="world-card-meta">
                                    <span>{w.realism} Realism</span>
                                    {/* Calculated size display based on width */}
                                    <span>
                                        {w.width === 512 ? 'Small' : w.width === 2048 ? 'Large' : 'Medium'} Map
                                    </span>
                                </div>
                                <div className="world-card-desc">
                                    {/* Prefer description, fallback to setting if desc is empty/default */}
                                    {w.description && w.description !== "A newly discovered realm." ? w.description : w.setting}
                                </div>
                              </>
                           );
                        })()
                      )}
                  </div>

                  {/* customization modal*/}
                  {selectedWorld === 'NEW' && (
                       <div className="form-row" style={{marginBottom: '10px'}}>
                           <button className="setup-btn" onClick={() => setOverlayMode('customize')}>
                               CUSTOMIZE WORLD
                           </button>
                       </div>
                  )}
                </>
              )}

              <button 
                className="action-btn"
                onClick={mode === 'join' ? handleJoin : handleCreate}
              >
                {mode === 'join' ? 'ENTER' : 'INITIALIZE'}
              </button>
              
              {/* error or status feedback */}
              <div style={{color:'red', marginTop:'10px', fontSize:'0.8rem', textAlign:'center'}}>
                {ui.statusMsg !== 'System Ready...' ? ui.statusMsg : ''}
              </div>

              {/* active rooms table (autorefreshing) */}
              {mode === 'join' && activeRooms != null && activeRooms.length > 0 &&(
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
        
        {/* splash area */}
        <div className="login-splash">
           {/* splash content is here, pulled from src/assets */}
        </div>

        {/* login page footer */}
        <div className="login-footer">
             <button className="footer-btn" onClick={() => setOverlayMode('about')}>ABOUT</button>
             <button className="footer-btn" onClick={() => setStatus("Data features coming soon...")}>DATA</button>
        </div>
        {/* credit where credit is due */}
        <div 
            className="login-placeholder" 
            onClick={() => window.open('https://cehodum.wixsite.com/chelsea-portfolio', '_blank')}
        >
            Art by Chelsea Hodum
        </div>

        {/* About Modal */}
        {overlayMode === 'about' && (
             <div className="about-modal-overlay">
                 <div className="about-modal-box">
                      <h2>About GAOL</h2>
                      <div className="about-content">
                        <p>GAOL is a multiplayer AI storyteller experience.</p>
                        <p>Inspired by <i>AI Dungeon</i> and <i>Death by AI</i>, I sought to recreate the multiplayer experience with a rich, evolving world.</p>
                        <p>Create a room, define your setting, and embark on a collaborative storytelling journey with friends.</p>
                        <p><a href="https://github.com/JonFRutan/GAOL">GitHub</a> || <a href="https://www.linkedin.com/in/jonathanrutan/">LinkedIn</a> || <a href="https://jfelix.space">jfelix</a></p>
                      </div>
                      <button className="join-sm-btn" style={{width: '100%', marginTop: '20px'}} onClick={() => setOverlayMode('')}>CLOSE</button>
                 </div>
             </div>
        )}

        {/* Password Prompt Modal */}
        {mode === 'password' && (
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
                        <button className="join-sm-btn" style={{flex:1}} onClick={() => setMode('')}>CANCEL</button>
                        <button className="action-btn" style={{flex:1, marginTop:0}} onClick={handlePasswordSubmit}>UNLOCK</button>
                    </div>
                </div>
            </div>
        )}
        {/* World Creation Modal */}
        {overlayMode ==='customize' && (
            <div className="about-modal-overlay">
                <div className="about-modal-box">
                    <h2 style={{color:'var(--accent-gold)'}}>WORLD CREATION</h2>
                    <p style={{color:'#666', marginBottom:'20px', fontSize:'0.8rem'}}>Create a new world.</p>
                    
                    <div style={{width:'100%', display:'flex', flexDirection:'column', gap:'15px'}}>

                        <div className="form-row">
                             <label className="login-label">Name</label>
                             <input placeholder="e.g. Middle Earth" value={creationForm.newWorldName} onChange={e => setCreationForm({...creationForm, newWorldName: e.target.value})} />
                        </div>
                        
                        <div className="form-row">
                            <label className="login-label">Realism</label>
                            <select onChange={e => setCreationForm({...creationForm, realism: e.target.value})} value={creationForm.realism}>
                              <option value="High">High</option>
                              <option value="Mid">Medium</option>
                              <option value="Low">Low</option>
                            </select>
                        </div>
                        
                        <div className="form-row">
                            <label className="login-label">Map Size</label>
                            <select onChange={e => setCreationForm({...creationForm, size: e.target.value})} value={creationForm.size}>
                              <option value="Small">Small (512 x 256)</option>
                              <option value="Medium">Medium (1024 x 512)</option>
                              <option value="Large">Large (2048 x 1024)</option>
                            </select>
                        </div>

                        <div style={{borderBottom: '1px solid #333', margin: '10px 0'}}></div>

                        <div className="form-row" style={{alignItems:'flex-start'}}>
                            <label className="login-label" style={{marginTop:'10px', color:'var(--accent-gold)'}}>Setting</label>
                            <textarea 
                                placeholder="Describe your world here..." 
                                value={creationForm.setting} 
                                onChange={e => setCreationForm({...creationForm, setting: e.target.value})} 
                            />
                        </div>
                    </div>

                    <button className="action-btn" style={{marginTop:'25px'}} onClick={() => setOverlayMode('')}>
                        CONFIRM SETTINGS
                    </button>
                </div>
            </div>
        )}
      </div>
    );
  }
