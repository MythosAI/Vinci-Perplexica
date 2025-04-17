#!/bin/bash

start_time=$(date +%s)

echo "Bringing down Docker Compose services and removing volumes..."
# docker compose down -v
docker stop perplexica-stockalyzer-app-1

# echo "Pruning unused Docker data..."
# docker system prune -af

echo "Rebuilding services without cache..."
docker compose build --no-cache

echo "Starting up Docker Compose services..."
docker compose up -d

end_time=$(date +%s)
elapsed=$(( end_time - start_time ))

# echo "✅ Done in $elapsed seconds."
printf "✅ Done in %d minutes and %d seconds.\n" $((elapsed / 60)) $((elapsed % 60))
