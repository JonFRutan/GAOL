// Package models defines all domain types for GAOL.
// These replace the Python classes.py structures.
package models

import (
	"sync"
	"time"
)

// ──────────────────────────────────────────────
//  World-building entities
// ──────────────────────────────────────────────

type WorldEntity struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	TypeTag     string   `json:"type"`
	Description string   `json:"description"`
	Keywords    []string `json:"keywords"`
}

type Location struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	TypeTag     string   `json:"type"`
	Description string   `json:"description"`
	X           float64  `json:"x"`
	Y           float64  `json:"y"`
	Radius      float64  `json:"radius"`
	Affiliation string   `json:"affiliation"`
	Keywords    []string `json:"keywords"`
}

type Character struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Description string   `json:"description"`
	Role        string   `json:"role"`
	Affiliation string   `json:"affiliation"`
	Status      string   `json:"status"`
	Keywords    []string `json:"keywords"`
}

type Biology struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Habitat     string `json:"habitat"`
	Disposition string `json:"disposition"`
}

type MajorEvent struct {
	Title       string `json:"title"`
	Description string `json:"description"`
}

// World holds all persistent lore for a campaign world.
type World struct {
	ID          string        `json:"id"`
	Name        string        `json:"name"`
	Setting     string        `json:"setting"`
	Realism     string        `json:"realism"`
	Description string        `json:"description"`
	Width       int           `json:"width"`
	Height      int           `json:"height"`
	MajorEvents []MajorEvent  `json:"major_events"`
	Groups      []WorldEntity `json:"groups"`
	Characters  []Character   `json:"characters"`
	Locations   []Location    `json:"locations"`
	Biology     []Biology     `json:"biology"`
}

// GetEntityNames returns all named entities for text highlighting.
func (w *World) GetEntityNames() []string {
	names := make([]string, 0, len(w.Groups)+len(w.Characters)+len(w.Locations)+len(w.Biology))
	for _, g := range w.Groups {
		names = append(names, g.Name)
	}
	for _, c := range w.Characters {
		names = append(names, c.Name)
	}
	for _, l := range w.Locations {
		names = append(names, l.Name)
	}
	for _, b := range w.Biology {
		names = append(names, b.Name)
	}
	return names
}

//Player

type Player struct {
	SID           string   `json:"-"`               // WebSocket connection ID (not persisted)
	Username      string   `json:"username"`
	Connected     bool     `json:"-"`
	DCTimer       *time.Time `json:"-"`
	HP            int      `json:"hp"`
	Status        string   `json:"status"`
	Description   string   `json:"description"`
	Tags          []string `json:"tags"`
	Ambition      string   `json:"ambition"`
	Secret        string   `json:"secret"`
	IsReady       bool     `json:"is_ready"`
	HasActed      bool     `json:"has_acted"`
	CurrentAction string   `json:"-"`
	CurrentRoll   int      `json:"-"`
}

// PlayerState is the subset of Player sent to clients.
type PlayerState struct {
	Name        string   `json:"name"`
	HP          int      `json:"hp"`
	Status      string   `json:"status"`
	HasActed    bool     `json:"has_acted"`
	IsReady     bool     `json:"is_ready"`
	Tags        []string `json:"tags"`
	Ambition    string   `json:"ambition"`
	Secret      string   `json:"secret"`
	Description string   `json:"description"`
}

func (p *Player) ToState() PlayerState {
	tags := p.Tags
	if tags == nil {
		tags = []string{}
	}
	return PlayerState{
		Name:        p.Username,
		HP:          p.HP,
		Status:      p.Status,
		HasActed:    p.HasActed,
		IsReady:     p.IsReady,
		Tags:        tags,
		Ambition:    p.Ambition,
		Secret:      p.Secret,
		Description: p.Description,
	}
}

func (p *Player) ResetTurn() {
	p.CurrentAction = ""
	p.CurrentRoll = 0
	p.HasActed = false
}

type HistoryEntry struct {
	Sender string `json:"sender"`
	Text   string `json:"text"`
	Type   string `json:"type"`
}

//GameRoom 

type GameRoom struct {
	Mu sync.RWMutex

	RoomID       string                  `json:"room_id"`
	Setting      string                  `json:"setting"`
	Realism      string                  `json:"realism"`
	WorldID      string                  `json:"world_id"`
	CustomAPIKey string                  `json:"-"` // never serialised
	Password     string                  `json:"-"` // never serialised
	History      []HistoryEntry          `json:"history"`
	Players      map[string]*Player      `json:"-"` // keyed by SID
	IsStarted    bool                    `json:"is_started"`
	AdminSID     string                  `json:"-"`
	DMOverride   string                  `json:"-"`
	IsFinished   bool                    `json:"is_finished"`
	AIModel      string                  `json:"ai_model"`
}

func NewGameRoom(roomID, setting, realism, worldID, apiKey, password string) *GameRoom {
	return &GameRoom{
		RoomID:       roomID,
		Setting:      setting,
		Realism:      realism,
		WorldID:      worldID,
		CustomAPIKey: apiKey,
		Password:     password,
		History:      []HistoryEntry{},
		Players:      make(map[string]*Player),
		AIModel:      "gemini-2.5-flash-lite",
	}
}

func (g *GameRoom) AddPlayer(sid, username string) *Player {
	g.Mu.Lock()
	defer g.Mu.Unlock()
	p := &Player{
		SID:       sid,
		Username:  username,
		Connected: true,
		HP:        100,
		Status:    "Healthy",
		Tags:      []string{},
		Ambition:  "Unknown",
	}
	g.Players[sid] = p
	return p
}

func (g *GameRoom) RemovePlayer(sid string) {
	g.Mu.Lock()
	defer g.Mu.Unlock()
	delete(g.Players, sid)
}

func (g *GameRoom) AllPlayersActed() bool {
	g.Mu.RLock()
	defer g.Mu.RUnlock()
	if len(g.Players) == 0 {
		return false
	}
	active := 0
	for _, p := range g.Players {
		if p.Connected {
			active++
			if !p.HasActed {
				return false
			}
		}
	}
	return active > 0
}

func (g *GameRoom) AllPlayersReady() bool {
	g.Mu.RLock()
	defer g.Mu.RUnlock()
	if len(g.Players) == 0 {
		return false
	}
	for _, p := range g.Players {
		if !p.IsReady {
			return false
		}
	}
	return true
}

// CompileTurnActions builds the combined action block for the AI prompt.
func (g *GameRoom) CompileTurnActions() string {
	g.Mu.RLock()
	defer g.Mu.RUnlock()
	result := ""
	for _, p := range g.Players {
		action := p.CurrentAction
		if action == "" {
			action = "No action taken."
		}
		roll := "(No Roll)"
		if p.CurrentRoll > 0 {
			roll = "Rolled: " + itoa(p.CurrentRoll)
		}
		result += "- " + p.Username + " " + roll + " attempts to: " + action + "\n"
	}
	return result
}

// ResetTurns resets all player turn state.
func (g *GameRoom) ResetTurns() {
	g.Mu.Lock()
	defer g.Mu.Unlock()
	for _, p := range g.Players {
		p.ResetTurn()
	}
}

// GetPartyStatusString builds the party block for the AI prompt.
func (g *GameRoom) GetPartyStatusString() string {
	g.Mu.RLock()
	defer g.Mu.RUnlock()
	result := "CURRENT PARTY STATUS:\n"
	for _, p := range g.Players {
		tagsStr := "None"
		if len(p.Tags) > 0 {
			tagsStr = joinStrings(p.Tags, ", ")
		}
		descStr := ""
		if p.Description != "" {
			descStr = " (Summary: " + p.Description + ")"
		}
		result += " * " + p.Username + ": " + p.Status + " (HP: " + itoa(p.HP) + "/100)" + descStr + "\n"
		result += "   - Tags: " + tagsStr + "\n"
		result += "   - Ambition: " + p.Ambition + "\n"
		if p.Secret != "" {
			result += "   - SECRET (Only known to you and player): " + p.Secret + "\n"
		}
	}
	return result
}

// GetPlayerStates returns the array sent to clients.
func (g *GameRoom) GetPlayerStates() []PlayerState {
	g.Mu.RLock()
	defer g.Mu.RUnlock()
	states := make([]PlayerState, 0, len(g.Players))
	for _, p := range g.Players {
		states = append(states, p.ToState())
	}
	return states
}

// FindPlayerByName returns a player by username.
func (g *GameRoom) FindPlayerByName(name string) (*Player, string) {
	g.Mu.RLock()
	defer g.Mu.RUnlock()
	for sid, p := range g.Players {
		if p.Username == name {
			return p, sid
		}
	}
	return nil, ""
}

// ToPublicInfo returns the data shown in the room list.
type RoomListEntry struct {
	ID           string `json:"id"`
	World        string `json:"world"`
	Setting      string `json:"setting"`
	PlayerCount  int    `json:"player_count"`
	IsStarted    bool   `json:"is_started"`
	HasCustomKey bool   `json:"has_custom_key"`
	IsPrivate    bool   `json:"is_private"`
}

// ──────────────────────────────────────────────
//  AI response schema (parsed from Gemini JSON)
// ──────────────────────────────────────────────

type AIResponse struct {
	StoryText        string                            `json:"story_text"`
	Updates          map[string]PlayerUpdate            `json:"updates"`
	WorldUpdates     []MajorEvent                       `json:"world_updates"`
	LocationUpdates  map[string]LocationUpdate           `json:"location_updates"`
	CharacterUpdates map[string]CharacterUpdate          `json:"character_updates"`
	GroupUpdates     map[string]GroupUpdate              `json:"group_updates"`
	BiologyUpdates   map[string]BiologyUpdate            `json:"biology_updates"`
	NewGroups        []WorldEntity                       `json:"new_group"`
	NewLocations     []Location                          `json:"new_locations"`
	NewCharacters    []Character                         `json:"new_characters"`
	NewBiology       []Biology                           `json:"new_biology"`
}

type PlayerUpdate struct {
	HPChange    *int     `json:"hp_change,omitempty"`
	Status      string   `json:"status,omitempty"`
	TagsUpdate  []string `json:"tags_update,omitempty"`
	Ambition    string   `json:"ambition_update,omitempty"`
	Description string   `json:"description,omitempty"`
}

type LocationUpdate struct {
	Affiliation string  `json:"affiliation,omitempty"`
	Description string  `json:"description,omitempty"`
	Radius      float64 `json:"radius,omitempty"`
}

type CharacterUpdate struct {
	Status      string `json:"status,omitempty"`
	Description string `json:"description,omitempty"`
}

type GroupUpdate struct {
	Description string   `json:"description,omitempty"`
	Keywords    []string `json:"keywords,omitempty"`
}

type BiologyUpdate struct {
	Description string `json:"description,omitempty"`
	Habitat     string `json:"habitat,omitempty"`
	Disposition string `json:"disposition,omitempty"`
}

// ──────────────────────────────────────────────
//  Helpers (avoid importing strconv everywhere)
// ──────────────────────────────────────────────

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	s := ""
	neg := false
	if n < 0 {
		neg = true
		n = -n
	}
	for n > 0 {
		s = string(rune('0'+n%10)) + s
		n /= 10
	}
	if neg {
		s = "-" + s
	}
	return s
}

func joinStrings(ss []string, sep string) string {
	if len(ss) == 0 {
		return ""
	}
	result := ss[0]
	for _, s := range ss[1:] {
		result += sep + s
	}
	return result
}