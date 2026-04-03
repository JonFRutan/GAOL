// Package db provides SQLite persistence for GAOL.
// Replaces all JSON file read/write with proper database operations.
package db

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"sync"

	_ "github.com/mattn/go-sqlite3"

	"github.com/JonFRutan/gaol-server/internal/models"
)

type Store struct {
	db *sql.DB
	mu sync.Mutex // serialise writes
}

// Open creates (or opens) the SQLite database and runs migrations.
func Open(path string) (*Store, error) {
	db, err := sql.Open("sqlite3", path+"?_journal_mode=WAL&_busy_timeout=5000")
	if err != nil {
		return nil, fmt.Errorf("open db: %w", err)
	}
	s := &Store{db: db}
	if err := s.migrate(); err != nil {
		return nil, fmt.Errorf("migrate: %w", err)
	}
	return s, nil
}

func (s *Store) Close() error { return s.db.Close() }

//  Schema migration

func (s *Store) migrate() error {
	schema := `
	CREATE TABLE IF NOT EXISTS worlds (
		id          TEXT PRIMARY KEY,
		name        TEXT NOT NULL,
		setting     TEXT NOT NULL DEFAULT 'Medieval Fantasy',
		realism     TEXT NOT NULL DEFAULT 'High',
		description TEXT NOT NULL DEFAULT '',
		width       INTEGER NOT NULL DEFAULT 1024,
		height      INTEGER NOT NULL DEFAULT 512
	);

	CREATE TABLE IF NOT EXISTS world_events (
		id       INTEGER PRIMARY KEY AUTOINCREMENT,
		world_id TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
		title    TEXT NOT NULL,
		description TEXT NOT NULL,
		seq      INTEGER NOT NULL DEFAULT 0
	);
	CREATE INDEX IF NOT EXISTS idx_events_world ON world_events(world_id);

	CREATE TABLE IF NOT EXISTS world_groups (
		id          TEXT PRIMARY KEY,
		world_id    TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
		name        TEXT NOT NULL,
		type_tag    TEXT NOT NULL,
		description TEXT NOT NULL DEFAULT '',
		keywords    TEXT NOT NULL DEFAULT '[]'
	);
	CREATE INDEX IF NOT EXISTS idx_groups_world ON world_groups(world_id);

	CREATE TABLE IF NOT EXISTS world_locations (
		id          TEXT PRIMARY KEY,
		world_id    TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
		name        TEXT NOT NULL,
		type_tag    TEXT NOT NULL,
		description TEXT NOT NULL DEFAULT '',
		x           REAL NOT NULL DEFAULT 0,
		y           REAL NOT NULL DEFAULT 0,
		radius      REAL NOT NULL DEFAULT 1,
		affiliation TEXT NOT NULL DEFAULT 'Independent',
		keywords    TEXT NOT NULL DEFAULT '[]'
	);
	CREATE INDEX IF NOT EXISTS idx_locations_world ON world_locations(world_id);

	CREATE TABLE IF NOT EXISTS world_characters (
		id          TEXT PRIMARY KEY,
		world_id    TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
		name        TEXT NOT NULL,
		description TEXT NOT NULL DEFAULT '',
		role        TEXT NOT NULL DEFAULT 'NPC',
		affiliation TEXT NOT NULL DEFAULT '',
		status      TEXT NOT NULL DEFAULT 'Alive',
		keywords    TEXT NOT NULL DEFAULT '[]'
	);
	CREATE INDEX IF NOT EXISTS idx_characters_world ON world_characters(world_id);

	CREATE TABLE IF NOT EXISTS world_biology (
		id          TEXT PRIMARY KEY,
		world_id    TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
		name        TEXT NOT NULL,
		description TEXT NOT NULL DEFAULT '',
		habitat     TEXT NOT NULL DEFAULT '',
		disposition TEXT NOT NULL DEFAULT ''
	);
	CREATE INDEX IF NOT EXISTS idx_biology_world ON world_biology(world_id);

	CREATE TABLE IF NOT EXISTS rooms (
		id          TEXT PRIMARY KEY,
		setting     TEXT NOT NULL DEFAULT 'Medieval Fantasy',
		realism     TEXT NOT NULL DEFAULT 'High',
		world_id    TEXT NOT NULL,
		is_started  INTEGER NOT NULL DEFAULT 0,
		is_private  INTEGER NOT NULL DEFAULT 0,
		history     TEXT NOT NULL DEFAULT '[]',
		ai_model    TEXT NOT NULL DEFAULT 'gemini-2.5-flash-lite'
	);

	CREATE TABLE IF NOT EXISTS players (
		id          INTEGER PRIMARY KEY AUTOINCREMENT,
		room_id     TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
		username    TEXT NOT NULL,
		hp          INTEGER NOT NULL DEFAULT 100,
		status      TEXT NOT NULL DEFAULT 'Healthy',
		description TEXT NOT NULL DEFAULT '',
		tags        TEXT NOT NULL DEFAULT '[]',
		ambition    TEXT NOT NULL DEFAULT 'Unknown',
		secret      TEXT NOT NULL DEFAULT '',
		is_ready    INTEGER NOT NULL DEFAULT 0,
		UNIQUE(room_id, username)
	);
	CREATE INDEX IF NOT EXISTS idx_players_room ON players(room_id);

	CREATE TABLE IF NOT EXISTS token_audit (
		id           INTEGER PRIMARY KEY AUTOINCREMENT,
		timestamp    TEXT NOT NULL,
		input_tokens INTEGER NOT NULL,
		output_tokens INTEGER NOT NULL,
		total_tokens INTEGER NOT NULL,
		world_name   TEXT NOT NULL DEFAULT '',
		player_count INTEGER NOT NULL DEFAULT 0,
		ai_model     TEXT NOT NULL DEFAULT ''
	);
	`
	_, err := s.db.Exec(schema)
	return err
}

//  World CRUD
func (s *Store) SaveWorld(w *models.World) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	_, err = tx.Exec(`INSERT INTO worlds (id, name, setting, realism, description, width, height)
		VALUES (?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			name=excluded.name, setting=excluded.setting, realism=excluded.realism,
			description=excluded.description, width=excluded.width, height=excluded.height`,
		w.ID, w.Name, w.Setting, w.Realism, w.Description, w.Width, w.Height)
	if err != nil {
		return fmt.Errorf("upsert world: %w", err)
	}

	// Rebuild events
	if _, err := tx.Exec(`DELETE FROM world_events WHERE world_id = ?`, w.ID); err != nil {
		return err
	}
	for i, evt := range w.MajorEvents {
		if _, err := tx.Exec(`INSERT INTO world_events (world_id, title, description, seq) VALUES (?, ?, ?, ?)`,
			w.ID, evt.Title, evt.Description, i); err != nil {
			return err
		}
	}

	// Rebuild groups
	if _, err := tx.Exec(`DELETE FROM world_groups WHERE world_id = ?`, w.ID); err != nil {
		return err
	}
	for _, g := range w.Groups {
		kw, _ := json.Marshal(g.Keywords)
		if _, err := tx.Exec(`INSERT INTO world_groups (id, world_id, name, type_tag, description, keywords) VALUES (?, ?, ?, ?, ?, ?)`,
			g.ID, w.ID, g.Name, g.TypeTag, g.Description, string(kw)); err != nil {
			return err
		}
	}

	// Rebuild locations
	if _, err := tx.Exec(`DELETE FROM world_locations WHERE world_id = ?`, w.ID); err != nil {
		return err
	}
	for _, l := range w.Locations {
		kw, _ := json.Marshal(l.Keywords)
		if _, err := tx.Exec(`INSERT INTO world_locations (id, world_id, name, type_tag, description, x, y, radius, affiliation, keywords) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			l.ID, w.ID, l.Name, l.TypeTag, l.Description, l.X, l.Y, l.Radius, l.Affiliation, string(kw)); err != nil {
			return err
		}
	}

	// Rebuild characters
	if _, err := tx.Exec(`DELETE FROM world_characters WHERE world_id = ?`, w.ID); err != nil {
		return err
	}
	for _, c := range w.Characters {
		kw, _ := json.Marshal(c.Keywords)
		if _, err := tx.Exec(`INSERT INTO world_characters (id, world_id, name, description, role, affiliation, status, keywords) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			c.ID, w.ID, c.Name, c.Description, c.Role, c.Affiliation, c.Status, string(kw)); err != nil {
			return err
		}
	}

	// Rebuild biology
	if _, err := tx.Exec(`DELETE FROM world_biology WHERE world_id = ?`, w.ID); err != nil {
		return err
	}
	for _, b := range w.Biology {
		if _, err := tx.Exec(`INSERT INTO world_biology (id, world_id, name, description, habitat, disposition) VALUES (?, ?, ?, ?, ?, ?)`,
			b.ID, w.ID, b.Name, b.Description, b.Habitat, b.Disposition); err != nil {
			return err
		}
	}

	return tx.Commit()
}

func (s *Store) LoadWorld(id string) (*models.World, error) {
	w := &models.World{ID: id}
	err := s.db.QueryRow(`SELECT name, setting, realism, description, width, height FROM worlds WHERE id = ?`, id).
		Scan(&w.Name, &w.Setting, &w.Realism, &w.Description, &w.Width, &w.Height)
	if err != nil {
		return nil, err
	}

	// Events
	rows, err := s.db.Query(`SELECT title, description FROM world_events WHERE world_id = ? ORDER BY seq`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var evt models.MajorEvent
		if err := rows.Scan(&evt.Title, &evt.Description); err != nil {
			return nil, err
		}
		w.MajorEvents = append(w.MajorEvents, evt)
	}

	// Groups
	gRows, err := s.db.Query(`SELECT id, name, type_tag, description, keywords FROM world_groups WHERE world_id = ?`, id)
	if err != nil {
		return nil, err
	}
	defer gRows.Close()
	for gRows.Next() {
		var g models.WorldEntity
		var kwJSON string
		if err := gRows.Scan(&g.ID, &g.Name, &g.TypeTag, &g.Description, &kwJSON); err != nil {
			return nil, err
		}
		json.Unmarshal([]byte(kwJSON), &g.Keywords)
		w.Groups = append(w.Groups, g)
	}

	// Locations
	lRows, err := s.db.Query(`SELECT id, name, type_tag, description, x, y, radius, affiliation, keywords FROM world_locations WHERE world_id = ?`, id)
	if err != nil {
		return nil, err
	}
	defer lRows.Close()
	for lRows.Next() {
		var l models.Location
		var kwJSON string
		if err := lRows.Scan(&l.ID, &l.Name, &l.TypeTag, &l.Description, &l.X, &l.Y, &l.Radius, &l.Affiliation, &kwJSON); err != nil {
			return nil, err
		}
		json.Unmarshal([]byte(kwJSON), &l.Keywords)
		w.Locations = append(w.Locations, l)
	}

	// Characters
	cRows, err := s.db.Query(`SELECT id, name, description, role, affiliation, status, keywords FROM world_characters WHERE world_id = ?`, id)
	if err != nil {
		return nil, err
	}
	defer cRows.Close()
	for cRows.Next() {
		var c models.Character
		var kwJSON string
		if err := cRows.Scan(&c.ID, &c.Name, &c.Description, &c.Role, &c.Affiliation, &c.Status, &kwJSON); err != nil {
			return nil, err
		}
		json.Unmarshal([]byte(kwJSON), &c.Keywords)
		w.Characters = append(w.Characters, c)
	}

	// Biology
	bRows, err := s.db.Query(`SELECT id, name, description, habitat, disposition FROM world_biology WHERE world_id = ?`, id)
	if err != nil {
		return nil, err
	}
	defer bRows.Close()
	for bRows.Next() {
		var b models.Biology
		if err := bRows.Scan(&b.ID, &b.Name, &b.Description, &b.Habitat, &b.Disposition); err != nil {
			return nil, err
		}
		w.Biology = append(w.Biology, b)
	}

	// Ensure non-nil slices for JSON
	if w.MajorEvents == nil { w.MajorEvents = []models.MajorEvent{} }
	if w.Groups == nil { w.Groups = []models.WorldEntity{} }
	if w.Locations == nil { w.Locations = []models.Location{} }
	if w.Characters == nil { w.Characters = []models.Character{} }
	if w.Biology == nil { w.Biology = []models.Biology{} }

	return w, nil
}

func (s *Store) LoadAllWorlds() ([]*models.World, error) {
	rows, err := s.db.Query(`SELECT id FROM worlds`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var worlds []*models.World
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		w, err := s.LoadWorld(id)
		if err != nil {
			log.Printf("[WARN] Failed to load world %s: %v", id, err)
			continue
		}
		worlds = append(worlds, w)
	}
	return worlds, nil
}

func (s *Store) DeleteWorld(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, err := s.db.Exec(`DELETE FROM worlds WHERE id = ?`, id)
	return err
}

//  Room persistence
func (s *Store) SaveRoom(g *models.GameRoom) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	histJSON, _ := json.Marshal(g.History)
	isPrivate := 0
	if g.Password != "" {
		isPrivate = 1
	}

	_, err := s.db.Exec(`INSERT INTO rooms (id, setting, realism, world_id, is_started, is_private, history, ai_model)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			is_started=excluded.is_started, history=excluded.history, ai_model=excluded.ai_model`,
		g.RoomID, g.Setting, g.Realism, g.WorldID, boolToInt(g.IsStarted), isPrivate, string(histJSON), g.AIModel)
	return err
}

func (s *Store) SavePlayer(roomID string, p *models.Player) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	tagsJSON, _ := json.Marshal(p.Tags)
	_, err := s.db.Exec(`INSERT INTO players (room_id, username, hp, status, description, tags, ambition, secret, is_ready)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(room_id, username) DO UPDATE SET
			hp=excluded.hp, status=excluded.status, description=excluded.description,
			tags=excluded.tags, ambition=excluded.ambition, secret=excluded.secret, is_ready=excluded.is_ready`,
		roomID, p.Username, p.HP, p.Status, p.Description, string(tagsJSON), p.Ambition, p.Secret, boolToInt(p.IsReady))
	return err
}

func (s *Store) DeleteRoom(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, err := s.db.Exec(`DELETE FROM rooms WHERE id = ?`, id)
	return err
}

func (s *Store) DeletePlayerFromRoom(roomID, username string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, err := s.db.Exec(`DELETE FROM players WHERE room_id = ? AND username = ?`, roomID, username)
	return err
}

// LoadRoomPlayers loads persisted player state for reconnection.
func (s *Store) LoadRoomPlayers(roomID string) ([]*models.Player, error) {
	rows, err := s.db.Query(`SELECT username, hp, status, description, tags, ambition, secret, is_ready FROM players WHERE room_id = ?`, roomID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var players []*models.Player
	for rows.Next() {
		p := &models.Player{}
		var tagsJSON string
		var ready int
		if err := rows.Scan(&p.Username, &p.HP, &p.Status, &p.Description, &tagsJSON, &p.Ambition, &p.Secret, &ready); err != nil {
			return nil, err
		}
		json.Unmarshal([]byte(tagsJSON), &p.Tags)
		p.IsReady = ready == 1
		p.Connected = false
		players = append(players, p)
	}
	return players, nil
}

//  Token Audit
func (s *Store) LogTokenUsage(timestamp string, input, output, total int, worldName string, playerCount int, model string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, err := s.db.Exec(`INSERT INTO token_audit (timestamp, input_tokens, output_tokens, total_tokens, world_name, player_count, ai_model) VALUES (?, ?, ?, ?, ?, ?, ?)`,
		timestamp, input, output, total, worldName, playerCount, model)
	return err
}

//  Helpers
func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

// HasDuplicateName checks for duplicate entity names (case-insensitive).
func HasDuplicateName(existing []string, name string) bool {
	lower := strings.ToLower(name)
	for _, n := range existing {
		if strings.ToLower(n) == lower {
			return true
		}
	}
	return false
}