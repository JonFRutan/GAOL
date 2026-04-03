build:
	go build -o bin/gaol-server ./cmd/server
run: build
	./bin/gaol-server
dev:
	air -c .air.toml || go run ./cmd/server
client:
	cd client && npm run dev
clean:
	rm -rf bin/
	rm -f data/gaol.db
all:
	@echo "Run 'make run' in one terminal and 'make client' in another"