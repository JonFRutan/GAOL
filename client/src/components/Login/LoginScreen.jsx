import { useState, useEffect } from 'react';
import './LoginScreen.css';

//The Login Screen
//This contains the available rooms, room creation, user setup, and world creation
export default function LoginScreen({ auth, setAuth, ui, setUi, socket, activeRooms, availableWorlds }) {
  const [mode, setMode] = useState('join');                   //by default you are looking to join a room
  const [selectedWorld, setSelectedWorld] = useState('');     //what world do you have selected in the room creation?
  const [joinPassword, setJoinPassword] = useState('');       //password in password field
  const [creationForm, setCreationForm] = useState({          //all the room creation settings
    password: '',
    newWorldName: '',
    setting: '',
    realism: 'High',
    size: 'Medium'
  });

  //default to first world (GAOL-1)
  useEffect(() => {
    if (availableWorlds?.length > 0 && !selectedWorld) {
      setSelectedWorld(availableWorlds[0].id);
    }
  }, [availableWorlds]);

  //provides a status message to the user (like prompting for a username)
  const setStatus = (msg) => setUi(prev => ({ ...prev, statusMsg: msg }));

  //joining a room
  //must have username and room code at least
  //emits a socket join event to the backend
  const handleJoin = () => {
    if (!auth.username?.trim()) { setStatus('Username required.'); return; }
    if (!auth.room?.trim()) { setStatus('Room Code required.'); return; }
    socket.emit('join', { username: auth.username, room: auth.room });
  };

  //"QuickJoin" is really just joining after a DC / page refresh
  //pulls from local storage current roomId to attempt a rejoin.
  const handleQuickJoin = (roomId) => {
    if (!auth.username?.trim()) { setStatus('ERROR: Enter a username first.'); return; }
    setAuth(prev => ({ ...prev, room: roomId }));
    socket.emit('join', { username: auth.username, room: roomId });
  };

  //creating a room.
  const handleCreate = () => {
    //you'll need a username (for you as the admin) and a code to identify the room
    if (!auth.username?.trim() || !auth.room?.trim()) {
      setStatus('Username and Room Code required.');
      return;
    }
    //map size width and height
    let mapWidth = 1024, mapHeight = 512;
    if (creationForm.size === 'Small') { mapWidth = 512; mapHeight = 256; }
    else if (creationForm.size === 'Large') { mapWidth = 2048; mapHeight = 1024; }
    //emit a room creation event, passes the world info, api key, room id and username
    socket.emit('create_room', {
      username: auth.username,
      room: auth.room,
      setting: creationForm.setting,
      realism: creationForm.realism,
      world_selection: selectedWorld || 'NEW',
      new_world_name: creationForm.newWorldName,
      custom_api_key: auth.apiKey,
      password: creationForm.password, //optional
      width: mapWidth,
      height: mapHeight
    });
  };

  //handles joining a room that has a password
  //sends same info, but with a password field
  const handlePasswordSubmit = () => {
    if (!joinPassword.trim()) return;
    socket.emit('join', {
      username: auth.username,
      room: ui.pendingRoom,
      password: joinPassword
    });
    setJoinPassword(''); //clear password from local storage afterwards
    setUi(prev => ({ ...prev, overlayMode: '' }));
  };

  //world info card helper by grabbing it among the available worlds list.
  const selectedWorldData = availableWorlds?.find(w => w.id === selectedWorld);

  return (
    <div className="login-container">
      {/* left sidebar */}
      <div className="login-sidebar">
        {mode === 'join' && (
          <img className="thumbnail-image" src="/GaolIcon.png" alt="GAOL" />
        )}
        <h1 style={mode === 'create' ? { fontSize: '2rem' } : undefined}>GAOL</h1>

        <div className="login-box">
          {/* mode toggle */}
          <div className="toggle-bar">
            <button className={`toggle-btn ${mode === 'join' ? 'active' : ''}`} onClick={() => setMode('join')}>
              JOIN ROOM
            </button>
            <button className={`toggle-btn ${mode === 'create' ? 'active' : ''}`} onClick={() => setMode('create')}>
              CREATE ROOM
            </button>
          </div>

          {/* username */}
          <div className="form-row">
            <label className="login-label">Username</label>
            <input
              placeholder="e.g. Shadowhawk30"
              value={auth.username}
              onChange={e => setAuth(prev => ({ ...prev, username: e.target.value }))}
            />
          </div>

          {/* room Code */}
          <div className="form-row">
            <label className="login-label">Room Code</label>
            <input
              placeholder="e.g. 1987"
              value={auth.room}
              onChange={e => setAuth(prev => ({ ...prev, room: e.target.value }))}
            />
          </div>

          {/* room creation fields */}
          {mode === 'create' && (
            <>
              <div className="form-row">
                <label className="login-label">Password (Optional)</label>
                <input
                  type="password"
                  placeholder="Leave empty for public"
                  value={creationForm.password}
                  onChange={e => setCreationForm(prev => ({ ...prev, password: e.target.value }))}
                />
              </div>

              <div className="form-row">
                <label className="login-label" style={{ color: 'var(--terminal-green)' }}>Gemini API Key</label>
                <input
                  type="password"
                  placeholder={auth.serverHasKey ? 'Server Key Active (Optional)' : 'REQUIRED'}
                  value={auth.apiKey}
                  onChange={e => setAuth(prev => ({ ...prev, apiKey: e.target.value }))}
                  style={{ borderColor: (!auth.apiKey && !auth.serverHasKey) ? 'var(--alert-red)' : 'var(--accent-dim)' }}
                />
              </div>

              <div style={{ height: '20px' }} />

              {/* world selection */}
              <div className="form-row">
                <label className="login-label">World</label>
                <select value={selectedWorld} onChange={e => setSelectedWorld(e.target.value)}>
                  {(availableWorlds || []).map(w => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                  <option value="NEW">
                    {creationForm.newWorldName ? `[NEW] ${creationForm.newWorldName}` : '+ Create New World'}
                  </option>
                </select>
              </div>

              {/* world info card */}
              <div className="world-info-card">
                {selectedWorld === 'NEW' ? (
                  <>
                    <div className="world-card-title">{creationForm.newWorldName || 'NEW WORLD'}</div>
                    <div className="world-card-meta">
                      <span>{creationForm.realism} Realism</span>
                      <span>{creationForm.size} Map</span>
                    </div>
                    <div className="world-card-desc">{creationForm.setting || 'No setting description provided...'}</div>
                  </>
                ) : selectedWorldData ? (
                  <>
                    <div className="world-card-title">{selectedWorldData.name}</div>
                    <div className="world-card-meta">
                      <span>{selectedWorldData.realism} Realism</span>
                      <span>{selectedWorldData.width === 512 ? 'Small' : selectedWorldData.width === 2048 ? 'Large' : 'Medium'} Map</span>
                    </div>
                    <div className="world-card-desc">
                      {selectedWorldData.description !== 'A newly discovered realm.' ? selectedWorldData.description : selectedWorldData.setting}
                    </div>
                  </>
                ) : null}
              </div>

              {selectedWorld === 'NEW' && (
                <div className="form-row" style={{ marginBottom: '10px' }}>
                  <button className="setup-btn" onClick={() => setUi(prev => ({ ...prev, overlayMode: 'customize' }))}>
                    CUSTOMIZE WORLD
                  </button>
                </div>
              )}
            </>
          )}

          <button className="action-btn" onClick={mode === 'join' ? handleJoin : handleCreate}>
            {mode === 'join' ? 'ENTER' : 'INITIALIZE'}
          </button>

          {/* status feedback */}
          {ui.statusMsg && ui.statusMsg !== 'System Ready...' && (
            <div style={{ color: 'red', marginTop: '10px', fontSize: '0.8rem', textAlign: 'center' }}>
              {ui.statusMsg}
            </div>
          )}

          {/* active rooms table */}
          {mode === 'join' && activeRooms?.length > 0 && (
            <div className="room-list-container">
              <h3>Available Rooms</h3>
              <table className="room-table">
                <thead>
                  <tr><th>ID</th><th>World</th><th>#</th><th>API</th><th>Action</th></tr>
                </thead>
                <tbody>
                  {activeRooms.map(r => (
                    <tr key={r.id}>
                      <td style={{ color: 'var(--accent-gold)' }}>{r.id}</td>
                      <td>{r.world}</td>
                      <td>{r.player_count}/6</td>
                      <td>
                        {r.has_custom_key
                          ? <span style={{ color: 'var(--terminal-green)', fontWeight: 'bold' }}>SELF</span>
                          : auth.serverHasKey
                            ? <span style={{ color: '#444' }}>SYS</span>
                            : <span style={{ color: 'var(--alert-red)', fontWeight: 'bold' }}>ERR</span>
                        }
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button className="join-sm-btn" onClick={() => handleQuickJoin(r.id)}>
                          {r.is_private ? 'LOCKED' : 'JOIN'}
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
      <div className="login-splash" />

      {/* footer */}
      <div className="login-footer">
        <button className="footer-btn" onClick={() => setUi(prev => ({ ...prev, overlayMode: 'about' }))}>ABOUT</button>
        <button className="footer-btn" onClick={() => setStatus('Data features coming soon...')}>DATA</button>
      </div>

      <div className="login-placeholder" onClick={() => window.open('https://cehodum.wixsite.com/chelsea-portfolio', '_blank')}>
        Art by Chelsea Hodum
      </div>

      {/* modals */}

      {ui.overlayMode === 'about' && (
        <div className="about-modal-overlay">
          <div className="about-modal-box">
            <h2>About GAOL</h2>
            <div className="about-content">
              <p>GAOL is a multiplayer AI storyteller experience.</p>
              <p>Inspired by <i>AI Dungeon</i> and <i>Death by AI</i>, I sought to recreate the multiplayer experience with a rich, evolving world.</p>
              <p>Create a room, define your setting, and embark on a collaborative storytelling journey with friends.</p>
              <p><a href="https://github.com/JonFRutan/GAOL">GitHub</a> || <a href="https://www.linkedin.com/in/jonathanrutan/">LinkedIn</a> || <a href="https://jfelix.space">jfelix</a></p>
            </div>
            <button className="join-sm-btn" style={{ width: '100%', marginTop: '20px' }} onClick={() => setUi(prev => ({ ...prev, overlayMode: '' }))}>CLOSE</button>
          </div>
        </div>
      )}

      {ui.overlayMode === 'password' && (
        <div className="about-modal-overlay">
          <div className="about-modal-box">
            <h2>SECURE ROOM</h2>
            <p style={{ color: '#888', marginBottom: '15px' }}>Room {ui.pendingRoom} is password protected.</p>
            <input
              type="password"
              placeholder="Enter Password"
              value={joinPassword}
              onChange={e => setJoinPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handlePasswordSubmit()}
              style={{ width: '100%', padding: '10px', background: '#000', border: '1px solid var(--accent-gold)', color: 'var(--accent-gold)', marginBottom: '20px', textAlign: 'center' }}
            />
            <div style={{ display: 'flex', width: '100%', gap: '10px' }}>
              <button className="join-sm-btn" style={{ flex: 1 }} onClick={() => setUi(prev => ({ ...prev, overlayMode: '' }))}>CANCEL</button>
              <button className="action-btn" style={{ flex: 1, marginTop: 0 }} onClick={handlePasswordSubmit}>UNLOCK</button>
            </div>
          </div>
        </div>
      )}

      {ui.overlayMode === 'customize' && (
        <div className="about-modal-overlay">
          <div className="about-modal-box">
            <h2 style={{ color: 'var(--accent-gold)' }}>WORLD CREATION</h2>
            <p style={{ color: '#666', marginBottom: '20px', fontSize: '0.8rem' }}>Create a new world.</p>
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div className="form-row">
                <label className="login-label">Name</label>
                <input placeholder="e.g. Middle Earth" value={creationForm.newWorldName} onChange={e => setCreationForm(prev => ({ ...prev, newWorldName: e.target.value }))} />
              </div>
              <div className="form-row">
                <label className="login-label">Realism</label>
                <select value={creationForm.realism} onChange={e => setCreationForm(prev => ({ ...prev, realism: e.target.value }))}>
                  <option value="High">High</option>
                  <option value="Mid">Medium</option>
                  <option value="Low">Low</option>
                </select>
              </div>
              <div className="form-row">
                <label className="login-label">Map Size</label>
                <select value={creationForm.size} onChange={e => setCreationForm(prev => ({ ...prev, size: e.target.value }))}>
                  <option value="Small">Small (512 x 256)</option>
                  <option value="Medium">Medium (1024 x 512)</option>
                  <option value="Large">Large (2048 x 1024)</option>
                </select>
              </div>
              <div style={{ borderBottom: '1px solid #333', margin: '10px 0' }} />
              <div className="form-row" style={{ alignItems: 'flex-start' }}>
                <label className="login-label" style={{ marginTop: '10px', color: 'var(--accent-gold)' }}>Setting</label>
                <textarea placeholder="Describe your world here..." value={creationForm.setting} onChange={e => setCreationForm(prev => ({ ...prev, setting: e.target.value }))} />
              </div>
            </div>
            <button className="action-btn" style={{ marginTop: '25px' }} onClick={() => setUi(prev => ({ ...prev, overlayMode: '' }))}>
              CONFIRM SETTINGS
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
