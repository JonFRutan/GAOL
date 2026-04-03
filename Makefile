.PHONY: build run clean deploy update update-code build-frontend restart-backend

#build the go server binary
build:
	go build -o bin/gaol-server ./cmd/server

#run the server
run: build
	./bin/gaol-server

#run the frontend dev server (Vite)
client:
	cd client && npm run dev

# redeploys by building the frontend / restarting the backend
deploy: build-frontend restart-backend
	@echo "Deploy completed"

#pull code form repo, rebuild the frontend, restart the backend
update: update-code build-frontend restart-backend
	@echo "Update completed"

#pull changes from github
update-code:
	@echo "Pulling latest changes from GitHub..."
	git pull

#rebuild the frontend
build-frontend:
	@echo "Building React/Vite frontend..."
	cd client && npm install && npm run build

#restart the backend. This calls a systemd service named "gaol"
restart-backend: build
	@echo "Restarting GAOL server..."
	@if command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet gaol; then \
		sudo systemctl restart gaol; \
	else \
		echo "No systemd service found. Run manually with: make run"; \
	fi

#cleanup build artifacts.
clean:
	rm -rf bin/
	rm -f data/gaol.db