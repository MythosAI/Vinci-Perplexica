up-local:
	docker compose -f docker-compose.yml -f docker-compose.override.local.yml up --build -d

down-local:
	docker compose -f docker-compose.yml -f docker-compose.override.local.yml down

up-remote:
	docker compose -f docker-compose.yml -f docker-compose.override.remote.yml up --build -d

down-remote:
	docker compose -f docker-compose.yml -f docker-compose.override.remote.yml down

rebuild-remote:
	docker compose -f docker-compose.yml -f docker-compose.override.remote.yml build --no-cache
	docker compose -f docker-compose.yml -f docker-compose.override.remote.yml up -d