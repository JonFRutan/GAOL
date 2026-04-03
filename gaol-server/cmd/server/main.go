//Go Backend
package main

import (
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/joho/godotenv"
	"github.com/rs/cors"

	"github.com/JonFRutan/gaol-server/internal/db"
	"github.com/JonFRutan/gaol-server/internal/handlers"
	"github.com/JonFRutan/gaol-server/internal/ws"
)

func main() {
	log.Println("------------------------------ GAOL v2.0 (Go) ------------------------------")
	//load .env
	godotenv.Load()
	//resolve API key
	rawKey := os.Getenv("GEMINI_API_KEY")
	defaultAPIKey := strings.TrimSpace(rawKey)
	if defaultAPIKey != "" {
		log.Printf("[SYSTEM] Server API Key Loaded: YES (Ends with %s)", defaultAPIKey[len(defaultAPIKey)-4:])
	} else {
		log.Println("[SYSTEM] Server API Key Loaded: NO (User must provide key)")
	}
	//open Sqlite DB
	dataDir := filepath.Join(".", "data")
	os.MkdirAll(dataDir, 0755)
	dbPath := filepath.Join(dataDir, "gaol.db")

	store, err := db.Open(dbPath)
	if err != nil {
		log.Fatalf("[FATAL] Database init failed: %v", err)
	}
	defer store.Close()
	log.Printf("[SYSTEM] Database opened at %s", dbPath)

	//WebSocket hub
	hub := ws.NewHub()
	go hub.Run()

	// Game server
	gameServer := handlers.NewGameServer(hub, store, defaultAPIKey)
	if err := gameServer.LoadState(); err != nil {
		log.Fatalf("[FATAL] Failed to load state: %v", err)
	}
	gameServer.RegisterHandlers()
	gameServer.StartDisconnectChecker()

	// HTTP routes
	mux := http.NewServeMux()

	// WebSocket endpoint
	mux.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		hub.ServeWS(w, r)
	})

	// Serve the React build (client/dist)
	clientDist := filepath.Join(".", "client", "dist")
	if _, err := os.Stat(clientDist); err == nil {
		fs := http.FileServer(http.Dir(clientDist))
		mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
			// If the file exists, serve it; otherwise serve index.html (SPA fallback)
			path := filepath.Join(clientDist, r.URL.Path)
			if _, err := os.Stat(path); os.IsNotExist(err) {
				http.ServeFile(w, r, filepath.Join(clientDist, "index.html"))
				return
			}
			fs.ServeHTTP(w, r)
		})
		log.Printf("[SYSTEM] Serving client from %s", clientDist)
	} else {
		log.Println("[SYSTEM] No client build found. API-only mode.")
		mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(`{"status":"GAOL v2.0 running","mode":"api-only"}`))
		})
	}

	// CORS
	handler := cors.New(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "OPTIONS"},
		AllowedHeaders:   []string{"*"},
		AllowCredentials: true,
	}).Handler(mux)

	port := os.Getenv("PORT")
	if port == "" {
		port = "5000"
	}

	log.Printf("[SYSTEM] GAOL server listening on :%s", port)
	if err := http.ListenAndServe(":"+port, handler); err != nil {
		log.Fatalf("[FATAL] Server error: %v", err)
	}
}