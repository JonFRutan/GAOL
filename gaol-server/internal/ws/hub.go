// Package ws provides a WebSocket hub with room-based broadcasting.
// It replaces Flask-SocketIO's room/emit system with gorilla/websocket.
package ws

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  4096,
	WriteBufferSize: 4096,
	CheckOrigin:     func(r *http.Request) bool { return true }, // CORS handled at HTTP layer
}

//  Message envelope (mimics Socket.IO protocol)

// Envelope is the JSON wrapper for all WebSocket messages.
// Clients send and receive: {"event": "...", "data": {...}}
type Envelope struct {
	Event string          `json:"event"`
	Data  json.RawMessage `json:"data"`
}

//  Client

type Client struct {
	ID   string
	Conn *websocket.Conn
	Hub  *Hub
	Send chan []byte
	Rooms map[string]bool // rooms this client has joined
	mu   sync.Mutex
}

func (c *Client) readPump(handler func(client *Client, env Envelope)) {
	defer func() {
		c.Hub.unregister <- c
		c.Conn.Close()
	}()

	for {
		_, message, err := c.Conn.ReadMessage()
		if err != nil {
			break
		}
		var env Envelope
		if err := json.Unmarshal(message, &env); err != nil {
			log.Printf("[WS] Bad message from %s: %v", c.ID, err)
			continue
		}
		handler(c, env)
	}
}

func (c *Client) writePump() {
	defer c.Conn.Close()
	for msg := range c.Send {
		if err := c.Conn.WriteMessage(websocket.TextMessage, msg); err != nil {
			break
		}
	}
}

// Emit sends a typed event to this specific client.
func (c *Client) Emit(event string, data interface{}) {
	payload, err := json.Marshal(data)
	if err != nil {
		log.Printf("[WS] Marshal error: %v", err)
		return
	}
	env := Envelope{Event: event, Data: payload}
	msg, _ := json.Marshal(env)
	select {
	case c.Send <- msg:
	default:
		log.Printf("[WS] Client %s send buffer full, dropping message", c.ID)
	}
}

// JoinRoom adds this client to a named room.
func (c *Client) JoinRoom(room string) {
	c.mu.Lock()
	c.Rooms[room] = true
	c.mu.Unlock()

	c.Hub.mu.Lock()
	if c.Hub.rooms[room] == nil {
		c.Hub.rooms[room] = make(map[string]*Client)
	}
	c.Hub.rooms[room][c.ID] = c
	c.Hub.mu.Unlock()
}

// LeaveRoom removes this client from a named room.
func (c *Client) LeaveRoom(room string) {
	c.mu.Lock()
	delete(c.Rooms, room)
	c.mu.Unlock()

	c.Hub.mu.Lock()
	if r, ok := c.Hub.rooms[room]; ok {
		delete(r, c.ID)
		if len(r) == 0 {
			delete(c.Hub.rooms, room)
		}
	}
	c.Hub.mu.Unlock()
}

//  Hub

type Hub struct {
	clients    map[string]*Client    // id -> client
	rooms      map[string]map[string]*Client // room -> (id -> client)
	register   chan *Client
	unregister chan *Client
	mu         sync.RWMutex

	// OnConnect is called when a new client connects.
	OnConnect func(client *Client)
	// OnDisconnect is called when a client disconnects.
	OnDisconnect func(client *Client)
	// OnMessage is called for every incoming message.
	OnMessage func(client *Client, env Envelope)
}

func NewHub() *Hub {
	return &Hub{
		clients:    make(map[string]*Client),
		rooms:      make(map[string]map[string]*Client),
		register:   make(chan *Client, 64),
		unregister: make(chan *Client, 64),
	}
}

func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client.ID] = client
			h.mu.Unlock()
			if h.OnConnect != nil {
				h.OnConnect(client)
			}

		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client.ID]; ok {
				delete(h.clients, client.ID)
				close(client.Send)
				// Remove from all rooms
				for room := range client.Rooms {
					if r, ok := h.rooms[room]; ok {
						delete(r, client.ID)
						if len(r) == 0 {
							delete(h.rooms, room)
						}
					}
				}
			}
			h.mu.Unlock()
			if h.OnDisconnect != nil {
				h.OnDisconnect(client)
			}
		}
	}
}

// GetClient returns a client by ID.
func (h *Hub) GetClient(id string) *Client {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.clients[id]
}

// EmitToRoom sends an event to all clients in a room.
func (h *Hub) EmitToRoom(room, event string, data interface{}) {
	payload, err := json.Marshal(data)
	if err != nil {
		return
	}
	env := Envelope{Event: event, Data: payload}
	msg, _ := json.Marshal(env)

	h.mu.RLock()
	clients := h.rooms[room]
	h.mu.RUnlock()

	for _, c := range clients {
		select {
		case c.Send <- msg:
		default:
		}
	}
}

// EmitToClient sends an event to a specific client by ID.
func (h *Hub) EmitToClient(clientID, event string, data interface{}) {
	h.mu.RLock()
	c, ok := h.clients[clientID]
	h.mu.RUnlock()
	if ok {
		c.Emit(event, data)
	}
}

// ServeWS upgrades an HTTP connection to WebSocket and registers the client.
func (h *Hub) ServeWS(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[WS] Upgrade error: %v", err)
		return
	}

	client := &Client{
		ID:    generateID(),
		Conn:  conn,
		Hub:   h,
		Send:  make(chan []byte, 256),
		Rooms: make(map[string]bool),
	}

	h.register <- client

	go client.writePump()
	go client.readPump(func(c *Client, env Envelope) {
		if h.OnMessage != nil {
			h.OnMessage(c, env)
		}
	})
}

//  ID generation

var (
	idCounter uint64
	idMu      sync.Mutex
)

func generateID() string {
	idMu.Lock()
	idCounter++
	id := idCounter
	idMu.Unlock()
	// Simple incrementing ID prefixed with "ws_"
	return "ws_" + uintToStr(id)
}

func uintToStr(n uint64) string {
	if n == 0 {
		return "0"
	}
	s := ""
	for n > 0 {
		s = string(rune('0'+n%10)) + s
		n /= 10
	}
	return s
}