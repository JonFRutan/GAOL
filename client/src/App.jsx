import { useState, useEffect } from 'react';
import { createSocket } from './hooks/gaolSocket.js';
import LoginScreen from './components/Login/LoginScreen.jsx';
import GameScreen from './components/Game/GameScreen.jsx';
import './styles/global.css';

//WebSocket connection
//Uses VITE_SOCKET_URL from .env (e.g. http://localhost:5000)
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || (import.meta.env.PROD ? undefined : 'http://localhost:5000');
const socket = createSocket(SOCKET_URL);

function App() {
  //Auth state
  //a bit of a misnomer, more like the user state
  //Your username, what room you are in, are you an admin, have you provided an API key?
  const [auth, setAuth] = useState({
    username: '',
    room: '',
    isAdmin: false,
    apiKey: '',
    serverHasKey: null
  });

  //UI status
  //view: What main components are you seeing
  //overlayMode: What modal is currently on screen
  const [ui, setUi] = useState({
    view: 'login',        // 'login' | 'playing'
    statusMsg: '',
    overlayMode: ''       // '' (nothing) | 'about' | 'customize' | 'password' | 'voice' | 'model' | 'key' | 'override' | 'promote' | 'kick'
  });

  //Game(room)s have a few pieces of information necessary to display:
  // - Messages in the message box
  // - Who is in the party
  // - World data (locations, people, history)
  // - isEmbarking, has the game started yet?
  // - isFinale, has the game ended yet?
  // - What AI model is the world using?
  const [gameData, setGameData] = useState({
    messages: [],
    party: [],
    worldData: null,
    isEmbarking: false,
    isFinale: false,
    lastRoll: null,
    currentModel: 'gemini-2.5-flash-lite'
  });

  //lobbies have rooms and worlds.
  const [lobbyData, setLobbyData] = useState({
    activeRooms: [],
    availableWorlds: []
  });

  //reset all game state (remove messages, go to default settings)
  const resetGameState = () => {
    setGameData({
      messages: [], party: [], worldData: null,
      isEmbarking: false, isFinale: false, lastRoll: null,
      currentModel: 'gemini-2.5-flash-lite'
    });
  };

  //leaving a game room, reset all locally stored info
  const handleExit = (data) => {
    setUi(prev => ({ ...prev, view: 'login', statusMsg: data?.msg || 'Disconnected.' }));
    setAuth(prev => ({ ...prev, room: '', isAdmin: false }));
    //also reset the game state
    resetGameState();
    localStorage.removeItem('gaol_session');
  };

  //Session recovery for refresh or disconnects
  useEffect(() => {
    const saved = localStorage.getItem('gaol_session');
    if (saved) {
      try {
        const session = JSON.parse(saved);
        if (session.username && session.room) {
          setAuth(prev => ({ ...prev, username: session.username }));
          socket.emit('rejoin', { username: session.username, room: session.room });
        }
      } catch { localStorage.removeItem('gaol_session'); }
    }
    socket.emit('get_worlds');
  }, []);

  //SOCKETS
  useEffect(() => {
    //grab currently open rooms
    socket.emit('get_rooms');

    //Lobby events
    //update the list of available worlds
    socket.on('world_list', (data) => {
      setLobbyData(prev => ({ ...prev, availableWorlds: data }));
    });
    //configuration of the server has changed (this happens on api key changes)
    socket.on('server_config', (data) => {
      setAuth(prev => ({ ...prev, serverHasKey: data.has_env_key }));
    });
    //update the list of open rooms
    socket.on('room_list', (data) => {
      setLobbyData(prev => ({ ...prev, activeRooms: data }));
    });
    //if a room has a password, tell the user they need to put one in
    socket.on('password_required', (data) => {
      setUi(prev => ({ ...prev, overlayMode: 'password', pendingRoom: data.room, statusMsg: 'Password Required.' }));
    });

    //socket for game connections
    socket.on('join_success', (data) => {
      setAuth(prev => ({
        ...prev, room: data.room, username: data.username, isAdmin: data.is_admin
      }));
      setGameData(prev => ({
        ...prev,
        worldData: data.world_details,
        messages: data.history?.length > 0 ? data.history : prev.messages,
        isEmbarking: false, isFinale: false
      }));
      setUi(prev => ({ ...prev, view: 'playing', statusMsg: 'Connected' }));
      localStorage.setItem('gaol_session', JSON.stringify({ username: data.username, room: data.room }));
    });
    //exiting events
    socket.on('room_closed', handleExit);
    socket.on('kicked', handleExit);

    //in-game socket events
    //a message is sent
    socket.on('message', (data) => {
      setGameData(prev => ({ ...prev, messages: [...prev.messages, data] }));
    });
    //a players status has been updated
    socket.on('status', (data) => {
      setUi(prev => ({ ...prev, statusMsg: data.msg }));
    });
    //the game state (party state) has been updated
    socket.on('game_state_update', (data) => {
      setGameData(prev => ({ ...prev, party: data }));
    });
    //a change has occured in the world data
    socket.on('world_update', (data) => {
      setGameData(prev => ({ ...prev, worldData: data }));
    });
    //the rooms admin has been transferred
    socket.on('admin_update', (data) => {
      setAuth(prev => ({ ...prev, isAdmin: data.is_admin }));
      setUi(prev => ({
        ...prev,
        statusMsg: data.is_admin ? "You are now the room's admin." : 'Admin privileges removed.'
      }));
    });

    //room polling - only done while in the 'login' screen
    const pollInterval = setInterval(() => {
      if (ui.view === 'login') socket.emit('get_rooms');
    }, 3000);

    //turn off all the sockets
    return () => {
      socket.off('world_list');
      socket.off('server_config');
      socket.off('room_list');
      socket.off('password_required');
      socket.off('join_success');
      socket.off('room_closed');
      socket.off('kicked');
      socket.off('message');
      socket.off('status');
      socket.off('game_state_update');
      socket.off('world_update');
      socket.off('admin_update');
      clearInterval(pollInterval);
    };
  }, [ui.view]);

  //render in the current screen
  if (ui.view === 'login') {
    return (
      <LoginScreen
        auth={auth}
        setAuth={setAuth}
        ui={ui}
        setUi={setUi}
        socket={socket}
        activeRooms={lobbyData.activeRooms}
        availableWorlds={lobbyData.availableWorlds}
      />
    );
  }

  return (
    <GameScreen
      auth={auth}
      setAuth={setAuth}
      ui={ui}
      setUi={setUi}
      socket={socket}
      gameData={gameData}
      setGameData={setGameData}
      onExit={handleExit}
    />
  );
}

export default App;