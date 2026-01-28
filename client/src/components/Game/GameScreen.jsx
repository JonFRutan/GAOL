  import { useState, useEffect, useRef } from 'react';
  
  export default function GameScreen({auth, setAuth, ui, setUi, socket, joinedWorldData}) {
    //consts
    //game data in an active session
    const [game, setGame] = useState({
        messages: [],             //messages in the game
        party: [],                //party members, stats, and statuses
        isReady: false,           //have you submitted your turn.
        isEmbarking: false,       //
        isFinale: false,
        lastRoll: null
    });

    const [player, setPlayer] = useState({
        username: '',
        tags: [],
        description: '',
        
    })

    const myStats = game.party.find(p => p.name === auth.username) || {
        name: auth.username, hp: 100, status: 'Alive', description: '', tags: [], ambition: '', secret: '', is_ready: false
    };
    const nonSystemMessages = game.messages.filter(m => m.sender !== 'System'); //filters out system messages from all the messages
    const isGameActive = nonSystemMessages.length > 0; //if messages have been sent that aren't system messages (e.g. changing AI model), the game is active
    const isLockedIn = game.isReady || isGameActive;
    const displayedPlayer = game.party.find(p => p.name === selectedPlayer) || myStats;
    const isOwnSheet = displayedPlayer.name === auth.username;
    const [inputValue, setInputValue] = useState('');
    //particles for embark explosion
    const [particles, setParticles] = useState([]);
    //ref used for auto-scrolling chat
    const chatEndRef = useRef(null);

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
    
    useEffect(() => {
        if (joinedWorldData) {setGame(prev => ({...prev, worldData: joinedWorldData}));}
    }, [joinedWorldData]);
    //auto-scrolls to the bottom of chat when new messages arrive
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [game.messages]);

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

    //changes player back to view screen, with no more session saved or admin privileges.
    const handleExit = (data) => {
        setUi(prev => ({...prev, view: 'login', statusMsg: data.msg }));
        setAuth(prev => ({...prev, room: '', isAdmin: false}));
        localStorage.removeItem('gaol_session');
    }

    //cleanly handle the leave room button
    //FIXME
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
        setGame(prev => ({...prev, isFinale: true }));
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
        if(game.isFinale) {
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
        if(!joinedWorldData) return [];
        
        const figures = [];
        
        // get explicit NPCs/Characters from the 'characters' list
        if(joinedWorldData.characters && joinedWorldData.characters.length > 0) {
            joinedWorldData.characters.forEach(c => {
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
        if(joinedWorldData.entities) {
            const godTypes = ['god', 'deity', 'titan', 'entity', 'lord', 'king', 'queen', 'emperor', 'leader', 'ceo', 'director', 'don']; //NOTE: Is this even used anymore?
            joinedWorldData.entities.forEach(e => {
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
        if(!joinedWorldData) return [];
        return joinedWorldData.groups || [];
    };

    //BIOLOGY
    //grabs biology from the worlds.json sheet
    const getBiology = () => {
        if(!joinedWorldData) return [];
        return joinedWorldData.biology || [];
    };

    //LOCATIONS
    //helper to aggregate locations from both new system and legacy entities
    const getLocations = () => {
        if(!joinedWorldData) return [];
        //get new system locations with coordinates
        return joinedWorldData.locations || [];
    };

    const showSheetPrompt = !game.isReady && nonSystemMessages.length === 0 && ui.activeTab === 'character' && isOwnSheet;

    //INGAME VIEW SOCKETS
    useEffect(() => {
        socket.on('message', (data) => {
            setGame(prev => ({...prev, messages: [...prev.messages, data]}));
        });
        socket.on('status', (data) => {
            setUi(prev => ({...prev, statusMsg: data.msg}))
        });
        socket.on('game_state_update', (data) => {
            setGame(prev => ({...prev, party: data}))
        });
        socket.on('world_update', (data) => {
            setGame(prev => ({...prev, worldData: data}))
        });
        //update a player to admin, uses the passed Auth const
        socket.on('admin_update', (data) => {
            setAuth(prev => ({...prev, isAdmin: data.is_admin}));
            setUi(prev => ({...prev, statusMsg: data.is_admin ? "You are now the admin." : "Admin privileges removed."}))
        });

        return () => {
            socket.off('message');
            socket.off('status');
            socket.off('game_state_update');
            socket.off('world_update');
            socket.off('admin_update');
            socket.off('room_closed');
            socket.off('kicked');
        };
    }, []);

    socket.on('room_closed', handleExit);
    socket.on('kicked', handleExit);

    ///////////////////////////////////////////////
    //                                           //
    //              RENDERING LOGIC              //
    //                                           //
    ///////////////////////////////////////////////
    
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
            {auth.isAdmin && (
                <button className="nav-btn model-btn" onClick={() => setShowModelModal(true)} title="Change AI Model">
                    MODEL
                </button>
            )}
            {/* Admin API Key Button */}
            {auth.isAdmin && (
                <button className="nav-btn key-btn" onClick={() => setShowKeyModal(true)} title="Update API Key">
                    KEY
                </button>
            )}
            {/* Admin Injection Button */}
            {auth.isAdmin && (
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
            <div className={`status-ticker ${ui.statusMsg.includes('THINKING') ? 'thinking' : ''}`}>
            STATUS: {ui.statusMsg} | WORLD: {joinedWorldData.name} {/* FIXME */}
            </div>

            <div className="chat-window">
                {/* embark button only visible to admin in pre-game */}
                {nonSystemMessages.length === 0 && auth.isAdmin && !game.isEmbarking && (
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
                {nonSystemMessages.length === 0 && !auth.isAdmin && (
                    <div className="embark-overlay">
                        <div style={{color:'#666', fontStyle:'italic'}}>
                            {isLockedIn ? "Waiting for host to start..." : "Fill out character sheet..."}
                        </div>
                    </div>
                )}

            {/* chat history mapping */}
            {game.messages.map((m, i) => (
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
                placeholder={!game.isFinale ? "Describe your action..." : "Campaign has ended."}
                /* filter out system messages so model changes don't enable chat too early */
                disabled={nonSystemMessages.length === 0 || game.isFinale} 
            />
            {/* Dice - Eventually we'll have frames to animate this rolling process */}
            <div className="dice-display">
                <div className="dice-label">D20</div>
                <div className={`dice-value ${game.lastRoll === 20 ? 'crit-success' : game.lastRoll === 1 ? 'crit-fail' : ''}`}>
                    {game.lastRoll !== null ? game.lastRoll : '-'}
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
                {auth.isAdmin && p.name !== username && (
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
                className={`tab-btn ${ui.activeTab === 'character' ? 'active' : ''}`}
                onClick={() => {setActiveTab('character'); setShowOverrideModal(false);}}
                >
                CHARACTER SHEET
                </button>
                <button 
                className={`tab-btn ${ui.activeTab === 'world' ? 'active' : ''}`}
                onClick={() => {setActiveTab('world'); setShowOverrideModal(false);}}
                >
                WORLD SHEET
                </button>
            </div>

            {ui.activeTab === 'character' ? (
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
                                {joinedWorldData.setting ? joinedWorldData.setting[0] : '?'}{joinedWorldData.realism ? joinedWorldData.realism[0] : '?'}
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
                                    value={isOwnSheet ? myStats.description : (displayedPlayer.description || '')}
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
                    {joinedWorldData ? (
                        <>
                            <div className="world-header">
                                <h2>{joinedWorldData.name}</h2>
                                <div className="world-meta">
                                    <span>{joinedWorldData.setting}</span> | <span>{joinedWorldData.realism} Realism</span>
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
                                    joinedWorldData.major_events && joinedWorldData.major_events.length > 0 ? (
                                        joinedWorldData.major_events.map((e, i) => (
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