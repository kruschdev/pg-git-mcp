.PHONY: build up down logs shell deploy

build:
	@echo "Using volume mounts for dev, no build required."

up:
	docker-compose up -d

down:
	docker-compose down

logs:
	docker-compose logs -f

shell:
	docker-compose exec pg-git-app sh

deploy:
	@echo "Run /deploy workflow for safe deployment with rsync excludes and health checks"
