// Package handlers implements all game event handlers.
// This is the Go equivalent of the @socketio.on(...) functions in app.py.
package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"

	"github.com/JonFRutan/gaol-server/internal/ai"
	"github.com/JonFRutan/gaol-server/internal/db"
	"github.com/JonFRutan/gaol-server/internal/models"
	"github.com/JonFRutan/gaol-server/internal/ws"
)

// GameServer holds all shared state and dependencies.
type GameServer struct {
	Hub           *ws.Hub
	Store         *db.Store
	DefaultAPIKey string

	Mu     sync.RWMutex
	worlds map[string]*models.World
	games  map[string]*models.GameRoom
}

func NewGameServer(hub *ws.Hub, store *db.Store, defaultKey string) *GameServer {
	return &GameServer{
		Hub:           hub,
		Store:         store,
		DefaultAPIKey: defaultKey,
		worlds:        make(map[string]*models.World),
		games:         make(map[string]*models.GameRoom),
	}
}

//  Initialization
func (gs *GameServer) LoadState() error {
	worlds, err := gs.Store.LoadAllWorlds()
	if err != nil {
		return fmt.Errorf("load worlds: %w", err)
	}
	for _, w := range worlds {
		gs.worlds[w.ID] = w
		log.Printf("[SYSTEM] Loaded world: %s (%s)", w.Name, w.ID)
	}
	log.Printf("[SYSTEM] Loaded %d worlds from database.", len(gs.worlds))

	// Seed default world if empty
	if len(gs.worlds) == 0 {
		log.Println("[SYSTEM] No worlds found, creating default...")
		w := &models.World{
			ID:          generateShortID(),
			Name:        "GAOL-1",
			Setting:     "Medieval Fantasy",
			Realism:     "High",
			Description: "The original timeline.",
			Width:       1024,
			Height:      512,
			MajorEvents: []models.MajorEvent{},
			Groups:      []models.WorldEntity{},
			Characters:  []models.Character{},
			Locations:   []models.Location{},
			Biology:     []models.Biology{},
		}
		gs.worlds[w.ID] = w
		gs.Store.SaveWorld(w)
	}

	return nil
}

// RegisterHandlers wires up all WebSocket event handlers.
func (gs *GameServer) RegisterHandlers() {
	gs.Hub.OnMessage = gs.handleMessage
	gs.Hub.OnDisconnect = gs.handleDisconnect
}

// StartDisconnectChecker runs the background goroutine that removes
// inactive players after 5 minutes.
func (gs *GameServer) StartDisconnectChecker() {
	go func() {
		ticker := time.NewTicker(10 * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			gs.checkDisconnectTimers()
		}
	}()
}

//  Message router
func (gs *GameServer) handleMessage(client *ws.Client, env ws.Envelope) {
	switch env.Event {
	case "get_worlds":
		gs.handleGetWorlds(client)
	case "get_rooms":
		gs.handleGetRooms(client)
	case "create_room":
		gs.handleCreateRoom(client, env.Data)
	case "join":
		gs.handleJoin(client, env.Data)
	case "rejoin":
		gs.handleRejoin(client, env.Data)
	case "leave_room":
		gs.handleLeaveRoom(client, env.Data)
	case "player_ready":
		gs.handlePlayerReady(client, env.Data)
	case "player_action":
		gs.handlePlayerAction(client, env.Data)
	case "embark":
		gs.handleEmbark(client, env.Data)
	case "finale":
		gs.handleFinale(client, env.Data)
	case "submit_override":
		gs.handleSubmitOverride(client, env.Data)
	case "change_model":
		gs.handleChangeModel(client, env.Data)
	case "update_api_key":
		gs.handleUpdateAPIKey(client, env.Data)
	case "promote_player":
		gs.handlePromotePlayer(client, env.Data)
	case "kick_player":
		gs.handleKickPlayer(client, env.Data)
	default:
		log.Printf("[WS] Unknown event: %s", env.Event)
	}
}

//  Handler: get_worlds
func (gs *GameServer) handleGetWorlds(client *ws.Client) {
	gs.Mu.RLock()
	defer gs.Mu.RUnlock()

	type worldInfo struct {
		ID          string `json:"id"`
		Name        string `json:"name"`
		Setting     string `json:"setting"`
		Realism     string `json:"realism"`
		Description string `json:"description"`
		Width       int    `json:"width"`
		Height      int    `json:"height"`
	}
	list := make([]worldInfo, 0, len(gs.worlds))
	for _, w := range gs.worlds {
		list = append(list, worldInfo{
			ID: w.ID, Name: w.Name, Setting: w.Setting, Realism: w.Realism,
			Description: w.Description, Width: w.Width, Height: w.Height,
		})
	}
	client.Emit("world_list", list)

	hasKey := gs.DefaultAPIKey != "" && len(gs.DefaultAPIKey) > 10
	client.Emit("server_config", map[string]bool{"has_env_key": hasKey})
}

//  Handler: get_rooms
func (gs *GameServer) handleGetRooms(client *ws.Client) {
	gs.Mu.RLock()
	defer gs.Mu.RUnlock()

	list := make([]models.RoomListEntry, 0, len(gs.games))
	for _, g := range gs.games {
		worldName := "Unknown"
		if w, ok := gs.worlds[g.WorldID]; ok {
			worldName = w.Name
		}
		list = append(list, models.RoomListEntry{
			ID:           g.RoomID,
			World:        worldName,
			Setting:      g.Setting,
			PlayerCount:  len(g.Players),
			IsStarted:    g.IsStarted,
			HasCustomKey: g.CustomAPIKey != "",
			IsPrivate:    g.Password != "",
		})
	}
	client.Emit("room_list", list)
}

//  Handler: create_room
type createRoomData struct {
	Username       string `json:"username"`
	Room           string `json:"room"`
	Setting        string `json:"setting"`
	Realism        string `json:"realism"`
	WorldSelection string `json:"world_selection"`
	NewWorldName   string `json:"new_world_name"`
	CustomAPIKey   string `json:"custom_api_key"`
	Password       string `json:"password"`
	Width          int    `json:"width"`
	Height         int    `json:"height"`
}

func (gs *GameServer) handleCreateRoom(client *ws.Client, data json.RawMessage) {
	var d createRoomData
	if err := json.Unmarshal(data, &d); err != nil {
		client.Emit("status", statusMsg("ERROR: Invalid request."))
		return
	}

	gs.Mu.Lock()
	defer gs.Mu.Unlock()

	if _, exists := gs.games[d.Room]; exists {
		client.Emit("status", statusMsg("ERROR: Room ID already exists."))
		return
	}

	// Key validation
	hasCustomKey := d.CustomAPIKey != "" && len(d.CustomAPIKey) > 10
	hasEnvKey := gs.DefaultAPIKey != "" && len(gs.DefaultAPIKey) > 10
	if !hasCustomKey && !hasEnvKey {
		client.Emit("status", statusMsg("ERROR: API Key Required (Server has none, please provide one)."))
		return
	}

	if d.Width == 0 { d.Width = 1024 }
	if d.Height == 0 { d.Height = 512 }

	// Resolve world
	var finalWorldID, finalSetting, finalRealism string
	finalSetting = d.Setting
	finalRealism = d.Realism
	if finalRealism == "" { finalRealism = "High" }

	if d.WorldSelection == "NEW" {
		name := d.NewWorldName
		if name == "" { name = "World " + d.Room }
		w := &models.World{
			ID: generateShortID(), Name: name, Setting: d.Setting,
			Realism: d.Realism, Description: "A newly discovered realm.",
			Width: d.Width, Height: d.Height,
			MajorEvents: []models.MajorEvent{}, Groups: []models.WorldEntity{},
			Characters: []models.Character{}, Locations: []models.Location{}, Biology: []models.Biology{},
		}
		gs.worlds[w.ID] = w
		gs.Store.SaveWorld(w)
		finalWorldID = w.ID
	} else if _, ok := gs.worlds[d.WorldSelection]; ok {
		finalWorldID = d.WorldSelection
		w := gs.worlds[finalWorldID]
		finalSetting = w.Setting
		finalRealism = w.Realism
	} else {
		// Fallback: pick first world
		for id := range gs.worlds {
			finalWorldID = id
			break
		}
	}

	game := models.NewGameRoom(d.Room, finalSetting, finalRealism, finalWorldID, d.CustomAPIKey, d.Password)
	gs.games[d.Room] = game
	gs.Store.SaveRoom(game)

	// Join the creator via the standard join path (unlock first)
	gs.Mu.Unlock()
	joinData, _ := json.Marshal(map[string]string{
		"username": d.Username, "room": d.Room, "password": d.Password,
	})
	gs.handleJoin(client, joinData)
	gs.Mu.Lock() // re-lock for deferred unlock
}

//  Handler: join
type joinData struct {
	Username string `json:"username"`
	Room     string `json:"room"`
	Password string `json:"password"`
}

func (gs *GameServer) handleJoin(client *ws.Client, data json.RawMessage) {
	var d joinData
	if err := json.Unmarshal(data, &d); err != nil {
		return
	}

	gs.Mu.Lock()
	game, ok := gs.games[d.Room]
	if !ok {
		gs.Mu.Unlock()
		client.Emit("status", statusMsg("ERROR: Room does not exist. Create it first."))
		return
	}

	// Password check
	if game.Password != "" && game.Password != d.Password {
		gs.Mu.Unlock()
		client.Emit("password_required", map[string]string{"room": d.Room})
		return
	}

	// Check for ghost player to reclaim
	ghostPlayer, ghostSID := game.FindPlayerByName(d.Username)
	isAdmin := false

	if ghostPlayer != nil && !ghostPlayer.Connected {
		// Reclaim ghost
		game.RemovePlayer(ghostSID)
		ghostPlayer.SID = client.ID
		ghostPlayer.Connected = true
		ghostPlayer.DCTimer = nil
		game.Players[client.ID] = ghostPlayer
		if game.AdminSID == ghostSID || game.AdminSID == "offline_"+d.Username {
			game.AdminSID = client.ID
			isAdmin = true
		}
	} else {
		// Duplicate name check
		if ghostPlayer != nil {
			gs.Mu.Unlock()
			client.Emit("status", statusMsg(fmt.Sprintf("ERROR: Name \"%s\" is taken.", d.Username)))
			return
		}
		// Full check
		if len(game.Players) >= 6 {
			gs.Mu.Unlock()
			client.Emit("status", statusMsg("CONNECTION REJECTED: ROOM FULL (MAX 6)"))
			return
		}
		if len(game.Players) == 0 {
			isAdmin = true
			game.AdminSID = client.ID
		}
		game.AddPlayer(client.ID, d.Username)
	}

	// Hot-join: if game already started
	if game.IsStarted {
		p := game.Players[client.ID]
		p.HasActed = true
		p.CurrentAction = "Joins the party."
		p.IsReady = true
	}

	world := gs.worlds[game.WorldID]
	gs.Mu.Unlock()

	client.JoinRoom(d.Room)

	gs.Store.SaveRoom(game)
	gs.saveAllPlayers(game)

	gs.Hub.EmitToRoom(d.Room, "status", statusMsg(d.Username+" CONNECTED."))

	history := []models.HistoryEntry{}
	if game.IsStarted {
		history = game.History
	}

	client.Emit("join_success", map[string]interface{}{
		"room":          d.Room,
		"username":      d.Username,
		"world":         world.Name,
		"world_details": world,
		"is_admin":      isAdmin,
		"history":       history,
	})

	gs.Hub.EmitToRoom(d.Room, "game_state_update", game.GetPlayerStates())
}

//  Handler: rejoin
func (gs *GameServer) handleRejoin(client *ws.Client, data json.RawMessage) {
	var d joinData
	if err := json.Unmarshal(data, &d); err != nil {
		return
	}

	gs.Mu.Lock()
	game, ok := gs.games[d.Room]
	if !ok {
		gs.Mu.Unlock()
		client.Emit("room_closed", statusMsg("Session expired or invalid."))
		return
	}

	target, oldSID := game.FindPlayerByName(d.Username)
	if target == nil {
		gs.Mu.Unlock()
		client.Emit("room_closed", statusMsg("Session expired or invalid."))
		return
	}

	wasAdmin := game.AdminSID == oldSID || game.AdminSID == "offline_"+d.Username

	game.RemovePlayer(oldSID)
	target.SID = client.ID
	target.Connected = true
	target.DCTimer = nil

	// Auto-lock if player has data
	if target.Description != "" && len(target.Tags) > 0 && !target.IsReady {
		target.IsReady = true
	}

	game.Players[client.ID] = target
	if wasAdmin {
		game.AdminSID = client.ID
	}

	world := gs.worlds[game.WorldID]
	gs.Mu.Unlock()

	client.JoinRoom(d.Room)

	history := []models.HistoryEntry{}
	if game.IsStarted {
		history = game.History
	}

	client.Emit("join_success", map[string]interface{}{
		"room":          d.Room,
		"username":      d.Username,
		"world":         world.Name,
		"world_details": world,
		"is_admin":      wasAdmin,
		"history":       history,
	})

	gs.Hub.EmitToRoom(d.Room, "status", statusMsg(d.Username+" reconnected."))
	gs.Hub.EmitToRoom(d.Room, "game_state_update", game.GetPlayerStates())
}

//  Handler: leave_room
func (gs *GameServer) handleLeaveRoom(client *ws.Client, data json.RawMessage) {
	var d struct{ Room string `json:"room"` }
	if err := json.Unmarshal(data, &d); err != nil {
		return
	}

	gs.Mu.Lock()
	game, ok := gs.games[d.Room]
	if !ok {
		gs.Mu.Unlock()
		return
	}

	// If admin leaves, close the room
	if game.AdminSID == client.ID {
		gs.Hub.EmitToRoom(d.Room, "room_closed", statusMsg("The host has ended the session."))
		delete(gs.games, d.Room)
		gs.Store.DeleteRoom(d.Room)
		gs.Mu.Unlock()
		client.LeaveRoom(d.Room)
		return
	}

	p := game.Players[client.ID]
	name := ""
	if p != nil {
		name = p.Username
	}
	game.RemovePlayer(client.ID)

	if len(game.Players) == 0 {
		delete(gs.games, d.Room)
		gs.Store.DeleteRoom(d.Room)
		gs.Mu.Unlock()
	} else {
		gs.Mu.Unlock()
		gs.Store.SaveRoom(game)
		gs.Hub.EmitToRoom(d.Room, "status", statusMsg(name+" has left the party."))
		gs.Hub.EmitToRoom(d.Room, "game_state_update", game.GetPlayerStates())
	}

	client.LeaveRoom(d.Room)
}

//  Handler: player_ready
type playerReadyData struct {
	Room        string   `json:"room"`
	Description string   `json:"description"`
	Tags        []string `json:"tags"`
	Ambition    string   `json:"ambition"`
	Secret      string   `json:"secret"`
}

func (gs *GameServer) handlePlayerReady(client *ws.Client, data json.RawMessage) {
	var d playerReadyData
	if err := json.Unmarshal(data, &d); err != nil {
		return
	}

	gs.Mu.RLock()
	game, ok := gs.games[d.Room]
	gs.Mu.RUnlock()
	if !ok {
		return
	}

	game.Mu.Lock()
	p, ok := game.Players[client.ID]
	if !ok || p.IsReady || game.IsFinished {
		game.Mu.Unlock()
		return
	}

	p.Description = d.Description
	p.Tags = d.Tags
	p.Ambition = d.Ambition
	p.Secret = d.Secret
	p.IsReady = true
	game.Mu.Unlock()

	gs.Store.SavePlayer(d.Room, p)

	gs.Hub.EmitToRoom(d.Room, "game_state_update", game.GetPlayerStates())
	gs.Hub.EmitToRoom(d.Room, "status", statusMsg(p.Username+" is READY."))
}

//  Handler: player_action
type playerActionData struct {
	Username string `json:"username"`
	Room     string `json:"room"`
	Message  string `json:"message"`
	Roll     int    `json:"roll"`
}

func (gs *GameServer) handlePlayerAction(client *ws.Client, data json.RawMessage) {
	var d playerActionData
	if err := json.Unmarshal(data, &d); err != nil {
		return
	}

	gs.Mu.RLock()
	game, ok := gs.games[d.Room]
	gs.Mu.RUnlock()
	if !ok {
		return
	}

	game.Mu.Lock()
	p, ok := game.Players[client.ID]
	if !ok {
		game.Mu.Unlock()
		return
	}

	p.CurrentAction = d.Message
	p.CurrentRoll = d.Roll
	p.HasActed = true
	game.Mu.Unlock()

	gs.Hub.EmitToRoom(d.Room, "status", statusMsg(p.Username+" has locked in their move..."))
	gs.Hub.EmitToRoom(d.Room, "game_state_update", game.GetPlayerStates())

	if game.AllPlayersActed() {
		gs.processTurn(d.Room)
	} else {
		game.Mu.RLock()
		pending := 0
		for _, pl := range game.Players {
			if pl.Connected && !pl.HasActed {
				pending++
			}
		}
		game.Mu.RUnlock()
		gs.Hub.EmitToRoom(d.Room, "status", statusMsg(fmt.Sprintf("Waiting for %d player(s)...", pending)))
	}
}

//  Handler: embark
func (gs *GameServer) handleEmbark(client *ws.Client, data json.RawMessage) {
	var d struct{ Room string `json:"room"` }
	json.Unmarshal(data, &d)

	gs.Mu.RLock()
	game, ok := gs.games[d.Room]
	gs.Mu.RUnlock()
	if !ok {
		return
	}

	if !game.AllPlayersReady() {
		gs.Hub.EmitToRoom(d.Room, "status", statusMsg("Cannot Embark: Not all players are ready."))
		return
	}

	game.Mu.Lock()
	game.IsStarted = true
	for _, p := range game.Players {
		p.IsReady = false
	}
	game.Mu.Unlock()

	gs.Hub.EmitToRoom(d.Room, "status", statusMsg("INITIALIZING SCENARIO..."))

	gs.Mu.RLock()
	world := gs.worlds[game.WorldID]
	gs.Mu.RUnlock()

	aiData := gs.callAI(game, world, true, false)
	gs.applyAIUpdates(game, aiData, d.Room)

	storyText := aiData.StoryText
	if storyText == "" {
		storyText = "The adventure begins..."
	}

	game.Mu.Lock()
	game.History = append(game.History, models.HistoryEntry{Sender: "GAOL", Text: storyText, Type: "story"})
	game.Mu.Unlock()

	gs.Hub.EmitToRoom(d.Room, "message", map[string]string{"sender": "GAOL", "text": storyText})
	gs.Hub.EmitToRoom(d.Room, "status", statusMsg("GAOL awaits your move..."))
	gs.Hub.EmitToRoom(d.Room, "game_state_update", game.GetPlayerStates())

	gs.Store.SaveRoom(game)
}

//  Handler: finale
func (gs *GameServer) handleFinale(client *ws.Client, data json.RawMessage) {
	var d struct{ Room string `json:"room"` }
	json.Unmarshal(data, &d)

	gs.Mu.RLock()
	game, ok := gs.games[d.Room]
	gs.Mu.RUnlock()
	if !ok { return }

	if game.AdminSID != client.ID {
		client.Emit("status", statusMsg("UNAUTHORIZED."))
		return
	}

	gs.Hub.EmitToRoom(d.Room, "status", statusMsg("FINALIZING CAMPAIGN..."))

	gs.Mu.RLock()
	world := gs.worlds[game.WorldID]
	gs.Mu.RUnlock()

	aiData := gs.callAI(game, world, false, true)
	gs.applyAIUpdates(game, aiData, d.Room)

	storyText := aiData.StoryText
	game.Mu.Lock()
	game.History = append(game.History, models.HistoryEntry{Sender: "GAOL", Text: storyText, Type: "story"})
	game.IsFinished = true
	game.Mu.Unlock()

	gs.Hub.EmitToRoom(d.Room, "message", map[string]string{"sender": "GAOL", "text": storyText})
	gs.Hub.EmitToRoom(d.Room, "status", statusMsg("GAOL has moved on..."))
	gs.Hub.EmitToRoom(d.Room, "game_state_update", game.GetPlayerStates())

	gs.Store.SaveRoom(game)
}

//  Handler: submit_override (god mode)
func (gs *GameServer) handleSubmitOverride(client *ws.Client, data json.RawMessage) {
	var d struct {
		Room string `json:"room"`
		Text string `json:"text"`
	}
	json.Unmarshal(data, &d)

	gs.Mu.RLock()
	game, ok := gs.games[d.Room]
	gs.Mu.RUnlock()
	if !ok { return }

	if game.AdminSID != client.ID {
		client.Emit("status", statusMsg("UNAUTHORIZED: Only the Admin can use God Mode."))
		return
	}

	game.Mu.Lock()
	game.DMOverride = d.Text
	adminName := ""
	if p, ok := game.Players[client.ID]; ok {
		adminName = p.Username
	}
	whisper := models.HistoryEntry{Sender: "System", Text: "*" + adminName + "* whispers to GAOL...", Type: "story"}
	game.History = append(game.History, whisper)
	game.Mu.Unlock()

	client.Emit("status", statusMsg("GOD MODE ENABLED: Override queued for next turn."))
	gs.Hub.EmitToRoom(d.Room, "message", map[string]string{"sender": "System", "text": whisper.Text})
}

//  Handler: change_model
func (gs *GameServer) handleChangeModel(client *ws.Client, data json.RawMessage) {
	var d struct {
		Room  string `json:"room"`
		Model string `json:"model"`
	}
	json.Unmarshal(data, &d)

	gs.Mu.RLock()
	game, ok := gs.games[d.Room]
	gs.Mu.RUnlock()
	if !ok { return }

	if game.AdminSID != client.ID {
		client.Emit("status", statusMsg("UNAUTHORIZED."))
		return
	}

	game.Mu.Lock()
	game.AIModel = d.Model
	shift := models.HistoryEntry{Sender: "System", Text: "A shift occurs in the mind of GAOL...", Type: "story"}
	game.History = append(game.History, shift)
	game.Mu.Unlock()

	gs.Hub.EmitToRoom(d.Room, "message", map[string]string{"sender": "System", "text": shift.Text})
	client.Emit("status", statusMsg("Model updated to "+d.Model))
}

//  Handler: update_api_key
func (gs *GameServer) handleUpdateAPIKey(client *ws.Client, data json.RawMessage) {
	var d struct {
		Room   string `json:"room"`
		NewKey string `json:"new_key"`
	}
	json.Unmarshal(data, &d)

	gs.Mu.RLock()
	game, ok := gs.games[d.Room]
	gs.Mu.RUnlock()
	if !ok { return }

	if game.AdminSID != client.ID {
		client.Emit("status", statusMsg("UNAUTHORIZED."))
		return
	}

	game.Mu.Lock()
	game.CustomAPIKey = d.NewKey
	game.Mu.Unlock()

	client.Emit("status", statusMsg("API Key Updated for Session."))
}

//  Handler: promote_player
func (gs *GameServer) handlePromotePlayer(client *ws.Client, data json.RawMessage) {
	var d struct {
		Room       string `json:"room"`
		TargetName string `json:"target_name"`
		RevokeKey  bool   `json:"revoke_key"`
	}
	json.Unmarshal(data, &d)

	gs.Mu.RLock()
	game, ok := gs.games[d.Room]
	gs.Mu.RUnlock()
	if !ok { return }

	if game.AdminSID != client.ID { return }

	_, targetSID := game.FindPlayerByName(d.TargetName)
	if targetSID == "" { return }

	game.Mu.Lock()
	game.AdminSID = targetSID
	if d.RevokeKey {
		game.CustomAPIKey = ""
	}
	game.Mu.Unlock()

	gs.Hub.EmitToClient(client.ID, "admin_update", map[string]bool{"is_admin": false})
	gs.Hub.EmitToClient(targetSID, "admin_update", map[string]bool{"is_admin": true})
	gs.Hub.EmitToRoom(d.Room, "status", statusMsg("ADMIN TRANSFERRED TO "+d.TargetName))

	if d.RevokeKey {
		gs.Hub.EmitToRoom(d.Room, "status", statusMsg("Previous Admin revoked the API Key."))
	}

	gs.Store.SaveRoom(game)
	gs.Hub.EmitToRoom(d.Room, "game_state_update", game.GetPlayerStates())
}

//  Handler: kick_player
func (gs *GameServer) handleKickPlayer(client *ws.Client, data json.RawMessage) {
	var d struct {
		Room       string `json:"room"`
		TargetName string `json:"target_name"`
	}
	json.Unmarshal(data, &d)

	gs.Mu.RLock()
	game, ok := gs.games[d.Room]
	gs.Mu.RUnlock()
	if !ok { return }

	if game.AdminSID != client.ID { return }

	_, targetSID := game.FindPlayerByName(d.TargetName)
	if targetSID == "" { return }

	gs.Hub.EmitToClient(targetSID, "kicked", statusMsg("You have been kicked by the host."))
	game.RemovePlayer(targetSID)

	gs.Hub.EmitToRoom(d.Room, "status", statusMsg(d.TargetName+" was kicked."))
	gs.Hub.EmitToRoom(d.Room, "game_state_update", game.GetPlayerStates())

	gs.saveAllPlayers(game)
	gs.Store.SaveRoom(game)
}

//  Disconnect
func (gs *GameServer) handleDisconnect(client *ws.Client) {
	gs.Mu.RLock()
	defer gs.Mu.RUnlock()

	for roomID, game := range gs.games {
		game.Mu.Lock()
		p, ok := game.Players[client.ID]
		if ok {
			p.Connected = false
			now := time.Now()
			p.DCTimer = &now
			log.Printf("[CONNECTION] %s disconnected. Grace period (5m) started.", p.Username)
		}
		game.Mu.Unlock()

		if ok {
			gs.Store.SaveRoom(game)
			gs.Hub.EmitToRoom(roomID, "game_state_update", game.GetPlayerStates())

			if game.IsStarted && game.AllPlayersActed() {
				go gs.processTurn(roomID)
			}
		}
	}
}

func (gs *GameServer) checkDisconnectTimers() {
	gs.Mu.Lock()
	defer gs.Mu.Unlock()

	now := time.Now()
	timeout := 5 * time.Minute

	for roomID, game := range gs.games {
		var toKick []string
		game.Mu.Lock()
		for sid, p := range game.Players {
			if !p.Connected && p.DCTimer != nil {
				if now.Sub(*p.DCTimer) > timeout {
					toKick = append(toKick, sid)
				}
			}
		}
		game.Mu.Unlock()

		for _, sid := range toKick {
			game.Mu.Lock()
			name := game.Players[sid].Username
			delete(game.Players, sid)
			game.Mu.Unlock()

			log.Printf("[TIMEOUT] Removing %s from Room %s (inactive > 5m)", name, roomID)
			gs.Hub.EmitToRoom(roomID, "status", statusMsg(name+" was removed due to inactivity."))
		}

		if len(toKick) > 0 {
			if len(game.Players) == 0 {
				log.Printf("[CLEANUP] Deleting empty Room %s", roomID)
				delete(gs.games, roomID)
				gs.Store.DeleteRoom(roomID)
			} else {
				gs.Hub.EmitToRoom(roomID, "game_state_update", game.GetPlayerStates())
			}
		}
	}
}

//  Turn processing
func (gs *GameServer) processTurn(roomID string) {
	gs.Mu.RLock()
	game, ok := gs.games[roomID]
	if !ok {
		gs.Mu.RUnlock()
		return
	}
	world := gs.worlds[game.WorldID]
	gs.Mu.RUnlock()

	turnSummary := game.CompileTurnActions()
	game.Mu.Lock()
	game.History = append(game.History, models.HistoryEntry{Sender: "Party", Text: turnSummary, Type: "story"})
	game.Mu.Unlock()

	gs.Hub.EmitToRoom(roomID, "message", map[string]string{"sender": "Party", "text": turnSummary})
	gs.Hub.EmitToRoom(roomID, "status", statusMsg("GAOL IS THINKING..."))

	aiData := gs.callAI(game, world, false, false)
	gs.applyAIUpdates(game, aiData, roomID)

	storyText := aiData.StoryText
	if storyText == "" {
		storyText = "The DM remains silent."
	}

	game.Mu.Lock()
	game.DMOverride = ""
	game.History = append(game.History, models.HistoryEntry{Sender: "GAOL", Text: storyText, Type: "story"})
	game.Mu.Unlock()

	gs.Hub.EmitToRoom(roomID, "message", map[string]string{"sender": "GAOL", "text": storyText})

	game.ResetTurns()
	gs.Store.SaveRoom(game)
	gs.saveAllPlayers(game)

	gs.Hub.EmitToRoom(roomID, "status", statusMsg("GAOL awaits your move..."))
	gs.Hub.EmitToRoom(roomID, "game_state_update", game.GetPlayerStates())
}

//  AI integration
func (gs *GameServer) callAI(game *models.GameRoom, world *models.World, isEmbark, isFinale bool) *models.AIResponse {
	// Resolve API key
	apiKey := game.CustomAPIKey
	if apiKey == "" || len(apiKey) < 10 {
		apiKey = gs.DefaultAPIKey
	}
	if apiKey == "" {
		return &models.AIResponse{
			StoryText: "CRITICAL ERROR: No Gemini API Key provided.",
			Updates:   map[string]models.PlayerUpdate{},
		}
	}

	prompt := ai.BuildPrompt(game, world, isEmbark, isFinale)
	client := ai.NewClient(apiKey)

	log.Printf("[API CALL] Room %s submitting a turn (model: %s)", game.RoomID, game.AIModel)

	resp, usage, err := client.GenerateResponse(game.AIModel, prompt)
	if err != nil {
		log.Printf("[AI ERROR] %v", err)
		return &models.AIResponse{
			StoryText: "GAOL has gone silent.",
			Updates:   map[string]models.PlayerUpdate{},
		}
	}

	if usage != nil {
		log.Printf("[TOKENS] Input: %d | Output: %d | Total: %d", usage.InputTokens, usage.OutputTokens, usage.TotalTokens)
		worldName := ""
		if world != nil {
			worldName = world.Name
		}
		gs.Store.LogTokenUsage(
			time.Now().Format("2006-01-02 15:04:05"),
			usage.InputTokens, usage.OutputTokens, usage.TotalTokens,
			worldName, len(game.Players), game.AIModel,
		)
	}

	// Process response: highlight names in story text
	if resp.StoryText != "" {
		resp.StoryText = highlightNames(resp.StoryText, game, world)
	}

	return resp
}

func highlightNames(text string, game *models.GameRoom, world *models.World) string {
	// Highlight player names
	game.Mu.RLock()
	playerNames := make([]string, 0, len(game.Players))
	for _, p := range game.Players {
		playerNames = append(playerNames, regexp.QuoteMeta(p.Username))
	}
	game.Mu.RUnlock()

	if len(playerNames) > 0 {
		pattern := `\b(` + strings.Join(playerNames, "|") + `)\b`
		re, err := regexp.Compile("(?i)" + pattern)
		if err == nil {
			text = re.ReplaceAllString(text, `<span class="highlighted-name">$1</span>`)
		}
	}

	// Highlight entity names
	if world != nil {
		entityNames := world.GetEntityNames()
		if len(entityNames) > 0 {
			escaped := make([]string, len(entityNames))
			for i, n := range entityNames {
				escaped[i] = regexp.QuoteMeta(n)
			}
			pattern := `\b(` + strings.Join(escaped, "|") + `)\b`
			re, err := regexp.Compile("(?i)" + pattern)
			if err == nil {
				text = re.ReplaceAllString(text, `<span class="highlighted-entity">$1</span>`)
			}
		}
	}

	return text
}

func (gs *GameServer) applyAIUpdates(game *models.GameRoom, aiData *models.AIResponse, roomID string) {
	if aiData == nil {
		return
	}

	gs.Mu.Lock()
	world, worldExists := gs.worlds[game.WorldID]
	gs.Mu.Unlock()

	if worldExists && world != nil {
		// Add new world events
		for _, evt := range aiData.WorldUpdates {
			world.MajorEvents = append(world.MajorEvents, evt)
			if len(world.MajorEvents) > 20 {
				world.MajorEvents = world.MajorEvents[1:]
			}
		}

		// Add new groups (no duplicates)
		existingGroupNames := make([]string, len(world.Groups))
		for i, g := range world.Groups { existingGroupNames[i] = g.Name }
		for _, g := range aiData.NewGroups {
			if !db.HasDuplicateName(existingGroupNames, g.Name) {
				g.ID = generateEntityID()
				if g.Keywords == nil { g.Keywords = []string{} }
				world.Groups = append(world.Groups, g)
				existingGroupNames = append(existingGroupNames, g.Name)
				log.Printf("[LORE] Created Entity: %s (%s)", g.Name, g.TypeTag)
			}
		}

		// Add new locations (no duplicates)
		existingLocNames := make([]string, len(world.Locations))
		for i, l := range world.Locations { existingLocNames[i] = l.Name }
		for _, l := range aiData.NewLocations {
			if !db.HasDuplicateName(existingLocNames, l.Name) {
				l.ID = generateEntityID()
				if l.Keywords == nil { l.Keywords = []string{} }
				world.Locations = append(world.Locations, l)
				existingLocNames = append(existingLocNames, l.Name)
				log.Printf("[LORE] Created Location: %s at %.0f,%.0f", l.Name, l.X, l.Y)
			}
		}

		// Add new characters (no duplicates)
		existingCharNames := make([]string, len(world.Characters))
		for i, c := range world.Characters { existingCharNames[i] = c.Name }
		for _, c := range aiData.NewCharacters {
			if !db.HasDuplicateName(existingCharNames, c.Name) {
				c.ID = generateEntityID()
				if c.Keywords == nil { c.Keywords = []string{} }
				if c.Status == "" { c.Status = "Alive" }
				world.Characters = append(world.Characters, c)
				existingCharNames = append(existingCharNames, c.Name)
				log.Printf("[LORE] Created NPC: %s", c.Name)
			}
		}

		// Add new biology (no duplicates)
		existingBioNames := make([]string, len(world.Biology))
		for i, b := range world.Biology { existingBioNames[i] = b.Name }
		for _, b := range aiData.NewBiology {
			if !db.HasDuplicateName(existingBioNames, b.Name) {
				b.ID = generateEntityID()
				world.Biology = append(world.Biology, b)
				existingBioNames = append(existingBioNames, b.Name)
				log.Printf("[LORE] Created Biology: %s", b.Name)
			}
		}

		// Apply entity updates
		for locName, changes := range aiData.LocationUpdates {
			for i, l := range world.Locations {
				if strings.EqualFold(l.Name, locName) {
					if changes.Affiliation != "" { world.Locations[i].Affiliation = changes.Affiliation }
					if changes.Description != "" { world.Locations[i].Description = changes.Description }
					if changes.Radius != 0 { world.Locations[i].Radius = changes.Radius }
					log.Printf("[LORE] Updated Location: %s", l.Name)
					break
				}
			}
		}

		for charName, changes := range aiData.CharacterUpdates {
			for i, c := range world.Characters {
				if strings.EqualFold(c.Name, charName) {
					if changes.Status != "" { world.Characters[i].Status = changes.Status }
					if changes.Description != "" { world.Characters[i].Description = changes.Description }
					break
				}
			}
		}

		for groupName, changes := range aiData.GroupUpdates {
			for i, g := range world.Groups {
				if strings.EqualFold(g.Name, groupName) {
					if changes.Description != "" { world.Groups[i].Description = changes.Description }
					if changes.Keywords != nil { world.Groups[i].Keywords = changes.Keywords }
					break
				}
			}
		}

		for bioName, changes := range aiData.BiologyUpdates {
			for i, b := range world.Biology {
				if strings.EqualFold(b.Name, bioName) {
					if changes.Description != "" { world.Biology[i].Description = changes.Description }
					if changes.Habitat != "" { world.Biology[i].Habitat = changes.Habitat }
					if changes.Disposition != "" { world.Biology[i].Disposition = changes.Disposition }
					break
				}
			}
		}

		gs.Store.SaveWorld(world)
		gs.Hub.EmitToRoom(roomID, "world_update", world)
	}

	// Apply player updates
	game.Mu.Lock()
	for playerName, changes := range aiData.Updates {
		for _, p := range game.Players {
			if p.Username == playerName {
				if changes.HPChange != nil {
					p.HP += *changes.HPChange
					if p.HP < 0 { p.HP = 0 }
					if p.HP > 100 { p.HP = 100 }
				}
				if changes.Status != "" { p.Status = changes.Status }
				if changes.TagsUpdate != nil { p.Tags = changes.TagsUpdate }
				if changes.Ambition != "" { p.Ambition = changes.Ambition }
				if changes.Description != "" { p.Description = changes.Description }
				break
			}
		}
	}
	game.Mu.Unlock()
}

//  Helpers
func (gs *GameServer) saveAllPlayers(game *models.GameRoom) {
	game.Mu.RLock()
	defer game.Mu.RUnlock()
	for _, p := range game.Players {
		gs.Store.SavePlayer(game.RoomID, p)
	}
}

func statusMsg(msg string) map[string]string {
	return map[string]string{"msg": msg}
}

func generateShortID() string {
	id := uuid.New().String()
	return strings.ToUpper(id[:6])
}

func generateEntityID() string {
	id := uuid.New().String()
	return id[:8]
}