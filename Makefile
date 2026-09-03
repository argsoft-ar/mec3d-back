# =============================================================================
# MEC3D Backend - Makefile
# =============================================================================

.PHONY: help install dev start build test db-up db-down db-stop db-logs db-status \
        db-shell db-init db-seed db-migrate db-truncate db-reset db-fresh db-nuke \
        clean kill-port all restart full-reset test-watch test-ci

help: ## Muestra esta ayuda
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "%-15s %s\n", $$1, $$2}'

# -----------------------------------------------------------------------------
# SETUP
# -----------------------------------------------------------------------------

install: ## Instala dependencias npm
	npm install

setup: db-up install db-reset ## Setup completo: DB + deps + seed

# -----------------------------------------------------------------------------
# SERVIDOR
# -----------------------------------------------------------------------------

dev: ## Servidor en modo desarrollo (hot reload)
	npm run dev

start: ## Servidor en modo producción
	npm run start

build: ## Compila TypeScript a JS
	npm run build

# -----------------------------------------------------------------------------
# DATABASE - Docker
# -----------------------------------------------------------------------------

db-up: ## Levanta PostgreSQL con Docker
	docker compose up -d

db-down: ## Detiene y elimina contenedor
	docker compose down

db-stop: ## Para contenedor sin eliminarlo
	docker compose stop

db-logs: ## Muestra logs de PostgreSQL en tiempo real
	docker compose logs -f db

db-status: ## Estado del contenedor de DB
	docker compose ps

db-shell: ## Abre psql dentro del contenedor
	docker compose exec db psql -U postgres -d mec3d_db

# -----------------------------------------------------------------------------
# DATABASE - Datos
# -----------------------------------------------------------------------------

db-init: ## Inicializa el esquema de la base de datos
	npm run db:init

db-seed: ## Carga datos de prueba
	npm run db:seed

db-migrate: ## Ejecuta migraciones pendientes
	npm run db:migrate

db-truncate: ## Vacía todas las tablas (mantiene estructura)
	npm run db:truncate

db-reset: ## Reset de datos: init + seed
	npm run db:reset

db-fresh: db-down db-up ## Recrea DB desde cero (borra y recrea contenedor)
	@echo "Esperando que PostgreSQL este listo..."
	@sleep 3
	npm run db:reset

db-nuke: ## Elimina contenedor + volumen (BORRA TODOS LOS DATOS)
	docker compose down -v

# -----------------------------------------------------------------------------
# TESTING
# -----------------------------------------------------------------------------

test: ## Ejecuta todos los tests
	npm run test

test-watch: ## Tests en modo watch
	npm run test:watch

test-ci: ## Tests para CI/CD
	npm run test:ci

# -----------------------------------------------------------------------------
# UTILIDADES
# -----------------------------------------------------------------------------

clean: ## Elimina dist/, node_modules/ y coverage/
	rm -rf dist node_modules coverage

kill-port: ## Mata el proceso en el puerto 3000
	@netstat -ano | findstr :3000 | head -1 | awk '{print $$5}' | xargs -I {} taskkill //F //PID {} 2>/dev/null || echo "Puerto 3000 ya estaba libre"

# -----------------------------------------------------------------------------
# COMBINADOS
# -----------------------------------------------------------------------------

all: db-up dev ## Levanta DB y servidor en dev

restart: db-down db-up ## Reinicia el contenedor de base de datos

full-reset: db-nuke setup ## Reset total: elimina todo y reinstala desde cero
