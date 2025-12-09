import { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import './App.css';

const socket = io('http://localhost:5000');

function App() {
  const [gameState, setGameState] = useState('login'); 
  const [username, setUsername] = useState('');
  const [room, setRoom] = useState('');
  const [messages, setMessages] = useState([]);
  const [partyStats, setPartyStats] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [statusMsg, setStatusMsg] = useState('System Ready...');
  
  const chatEndRef = useRef(null);

  useEffect(() => {
    socket.on('message', (data) => {
      setMessages((prev) => [...prev, data]);
    });

    socket.on('status', (data) => {
      setStatusMsg(data.msg);
    });

    socket.on('game_state_update', (data) => {
      setPartyStats(data);
    });

    return () => { 
      socket.off('message'); 
      socket.off('status'); 
      socket.off('game_state_update'); 
    };
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const joinGame = () => {
    if (username && room) {
      socket.emit('join', { username, room });
      setGameState('playing');
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
          <input placeholder="Username" onChange={e => setUsername(e.target.value)} />
          <input placeholder="Room ID" onChange={e => setRoom(e.target.value)} />
          <button onClick={joinGame}>JOIN</button>
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
           STATUS: {statusMsg}
        </div>

        {/* Chat Log */}
        <div className="chat-window">
          {messages.map((m, i) => (
            <div key={i} className={`message-block ${m.sender === 'Gaol' ? 'gaol-msg' : 'player-msg'}`}>
              <div className="msg-header">
                {m.sender === 'Gaol' ? 'GAOL:' : 'Actions:'}
              </div>
              <div className="msg-body">
                {m.sender !== 'Gaol' && <span className="player-name">{m.sender} - </span>}
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
            Future Picture
          </div>
        </div>

      </div>
    </div>
  );
}

export default App;