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
        // Fix: Explicitly handle empty list vs existing list to prevent empty string state
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
      setGameState('playing');
    });

    //fetch worlds on mount
    socket.emit('get_worlds');

    return () => { 
      socket.off('message'); 
      socket.off('status'); 
      socket.off('game_state_update'); 
      socket.off('world_list');
      socket.off('join_success');
    };
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  //join existing room
  const handleJoin = () => {
    if (username && room) {
      socket.emit('join', { username, room });
    }
  };

  //create new room logic
  const handleCreate = () => {
    if (username && room) {
      // Safety: Ensure selectedWorld is set. If empty (unlikely with fix above), default to NEW
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

  const sendAction = () => {
    if (inputValue.trim()) {
      socket.emit('player_action', { username, room, message: inputValue });
      setInputValue('');
    }
  };

  const myStats = partyStats.find(p => p.name === username) || { 
    name: username, hp: 100, status: 'Alive' 
  };

  if (gameState === 'login') {
    return (
      <div className="login-container">
        <h1>GAOL</h1>
        
        <div className="login-box">
          
          {/* Toggle buttons moved inside the box */}
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

          {/* standard inputs with side labels */}
          <div className="form-row">
            <label className="login-label">Username</label>
            <input placeholder="e.g. Shadowhawk30" onChange={e => setUsername(e.target.value)} />
          </div>

          <div className="form-row">
            <label className="login-label">Room Code</label>
            <input placeholder="e.g. 1987" onChange={e => setRoom(e.target.value)} />
          </div>

          {/* extended options for create mode */}
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

              {/* setting and realism removed unless NEW world selected */}
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
        
        {/* Top Ticker */}
        <div className="status-ticker">
           STATUS: {statusMsg} | WORLD: {currentWorldName}
        </div>

        {/* Chat Log */}
        <div className="chat-window">
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
            </div>
          ))}
          {[...Array(Math.max(0, 6 - partyStats.length))].map((_, i) => (
            <div key={`empty-${i}`} className="mini-card empty">
              <span className="empty-slot">EMPTY</span>
            </div>
          ))}
        </div>

        {/* Character Sheet */}
        <div className="detail-view">
          <h2>{myStats.name}</h2>
          <div className="detail-stats">
            <div>Health: {myStats.hp} / 100</div>
            <div>Status: {myStats.status}</div>
          </div>
          <div className="portrait-placeholder">
             {setting} / {realism}
          </div>
        </div>

      </div>
    </div>
  );
}

export default App;