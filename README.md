# Alma - Lead Management

[![CI](https://github.com/hellohelldar/alma-lead/actions/workflows/ci.yml/badge.svg)](https://github.com/hellohelldar/alma-lead/actions/workflows/ci.yml)

A full-stack lead-management application for an immigration law firm.

- **Public lead intake** - a prospect submits their first name, last name, email, and resume/CV.
- **Automatic notifications** - on submission, both the prospect (confirmation) and an attorney (new-lead alert) are emailed.
- **Internal console** - an authenticated attorney views all leads and manually transitions each from `PENDING` → `REACHED_OUT` after reaching out.

**Stack:** FastAPI (async SQLAlchemy 2.0, Pydantic v2, Alembic) · Next.js (App Router, TypeScript, Tailwind) · SQLite/Postgres · Resend (with a zero-config console fallback) · local-filesystem storage (S3-ready).

See [`docs/DESIGN.md`](docs/DESIGN.md) for the system design and trade-offs, [`docs/AGENTS.md`](docs/AGENTS.md) + [`NOTES.md`](NOTES.md) for the coding-agent usage writeup and attribution, and [`docs/PROMPTS.md`](docs/PROMPTS.md) for representative prompt logs.

```
alma-lead/
├── backend/                  FastAPI service (app/, alembic/, tests/)
├── frontend/                 Next.js app (app/, components/, lib/)
├── deploy/                   staging/production Compose + Caddy (Postgres only)
├── docker-compose.yml        local Docker - Postgres (default)
├── docker-compose.sqlite.yml local Docker - SQLite (optional)
├── docs/                     DESIGN.md, AGENTS.md, PROMPTS.md, openapi.json
└── scripts/smoke.sh          full-stack smoke test
```

---

## Option A - Run locally (no Docker)

Two terminals. Requires Python 3.11+ and Node 20+. The API defaults to SQLite and the
console email backend, so **no database server and no API keys are needed**.

### 1. Backend → http://localhost:8000

```bash
cd backend
python -m venv .venv && source .venv/bin/activate     # or: uv venv && source .venv/bin/activate
pip install -e ".[dev]"                                # or: uv pip install -e ".[dev]"
cp .env.example .env                                   # optional; defaults work out of the box
alembic upgrade head                                   # create the schema
uvicorn app.main:app --reload
```

API docs (Swagger): http://localhost:8000/docs · Health: http://localhost:8000/health

Submitted leads "send" two emails - without a `RESEND_API_KEY` these are printed to the
backend console so you can see them. Set `RESEND_API_KEY` in `.env` to send real email.

### 2. Frontend → http://localhost:3000

```bash
cd frontend
npm install
cp .env.example .env.local            # NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
npm run dev
```

- Public form: http://localhost:3000
- Attorney login: http://localhost:3000/login
- Leads console: http://localhost:3000/leads

**Default attorney login:** `attorney@alma.com` / `changeme` (configurable in `backend/.env`).

---

## Option B - Run with Docker Compose

**Database policy:** staging, production, and CI always use **Postgres**
(`deploy/docker-compose.yml` and the default `docker-compose.yml`). For local
Docker you can optionally use **SQLite** instead when you don't need a DB
container.

### Default - Postgres (matches staging/production)

```bash
docker compose up --build
```

Brings up Postgres + the API + the web app. Credentials are preconfigured in
`docker-compose.yml` (override via a root `.env` - see `.env.example`):

| Setting | Value |
|---------|-------|
| Host (from backend container) | `db` |
| Host (from your machine) | `localhost:5432` |
| User / DB | `alma` / `alma` |
| Password | `alma` (override: `POSTGRES_PASSWORD=...`) |
| `DATABASE_URL` (backend) | `postgresql+asyncpg://alma:<password>@db:5432/alma` |

- Web app → http://localhost:3000
- API → http://localhost:8000/docs

Override secrets/credentials via environment or a root `.env` consumed by Compose
(`POSTGRES_PASSWORD`, `JWT_SECRET`, `ATTORNEY_PASSWORD`, `RESEND_API_KEY`, …).
The backend runs `alembic upgrade head` on startup.

### Optional - SQLite (local only)

```bash
docker compose -f docker-compose.sqlite.yml up --build
```

Uses a SQLite file in a Docker volume (`/data/alma.db`). Handy for a quick
full-stack test without running Postgres. **Do not use this for staging or
production.**

---

## Tests

```bash
cd backend && source .venv/bin/activate
pytest -q                 # backend API suite

cd ../frontend
npm run build             # type-checks + production build
```

---

## CI/CD

GitHub Actions runs three pipelines (details in [`deploy/README.md`](deploy/README.md)):

- **CI** (`ci.yml`) - every PR: backend ruff lint, **pytest sharded 3 ways** (parallel matrix via `pytest-split`), `alembic upgrade head` on a real Postgres, frontend eslint + production build, and a **full-stack smoke test** (`docker compose up` → Postgres + API + web → [`scripts/smoke.sh`](scripts/smoke.sh) runs the whole lead lifecycle).
- **Staging** (`staging.yml`) - push to `main`: build images → GHCR, deploy to the staging server, **post-deploy smoke test** against the live URL, maintain a moving `prerelease-main` draft.
- **Release** (`release.yml`) - push a `vX.Y.Z` tag: draft notes, build version-tagged images, deploy production, **non-destructive post-deploy smoke** (health + auth gate), publish the release.

Deploys are opt-in (`STAGING_DEPLOY_ENABLED` / `PRODUCTION_DEPLOY_ENABLED`), so the pipelines are safe before any server is provisioned. The deployment stack ([`deploy/`](deploy/)) runs the GHCR images behind Caddy with Postgres.

## Configuration reference

Backend env (`backend/.env.example`): `DATABASE_URL`, `JWT_SECRET`, `ACCESS_TOKEN_EXPIRE_MINUTES`,
`ATTORNEY_EMAIL`, `ATTORNEY_PASSWORD`, `ATTORNEY_NAME`, `RESEND_API_KEY`, `EMAIL_FROM`,
`ATTORNEY_NOTIFY_EMAIL`, `STORAGE_DIR`, `MAX_UPLOAD_BYTES`, `CORS_ORIGINS`.

Frontend env (`frontend/.env.example`): `NEXT_PUBLIC_API_BASE_URL`.

## Database & persistence

The app talks to its database through async SQLAlchemy and a single
`DATABASE_URL`, so switching engines is a config change - no code change.

| Context | `DATABASE_URL` | Notes |
|---------|----------------|-------|
| Local dev (no Docker) | `sqlite+aiosqlite:///./alma.db` | Zero setup; file-based. |
| Local Postgres | `postgresql+asyncpg://alma:alma@localhost:5432/alma` | Run any Postgres; then `alembic upgrade head`. |
| Docker Compose (default) | `postgresql+asyncpg://alma:<password>@db:5432/alma` | `docker compose up`; password from `POSTGRES_PASSWORD` (default `alma`). |
| Docker Compose (optional) | `sqlite+aiosqlite:////data/alma.db` | `docker compose -f docker-compose.sqlite.yml up`; local only. |
| Staging / production | Postgres (required) | [`deploy/docker-compose.yml`](deploy/docker-compose.yml); URL built from `POSTGRES_PASSWORD`. |

**Use the `asyncpg` driver** for Postgres (`postgresql+asyncpg://…`) - the engine
is async. To point a local dev server at Postgres:

```bash
# backend/.env
DATABASE_URL=postgresql+asyncpg://alma:alma@localhost:5432/alma
```

```bash
cd backend && source .venv/bin/activate
alembic upgrade head      # apply the schema to the new database
uvicorn app.main:app --reload
```

**Migrations are the source of truth.** Alembic owns the schema
(`backend/alembic/versions/`); the app's startup `create_all` is a dev
convenience and a no-op once migrated. In Docker and in every deployed
environment the backend image runs `alembic upgrade head` on startup, so
schema changes apply automatically before the server serves traffic. After a
model change, generate a migration with
`alembic revision --autogenerate -m "..."`.

**Other persistence.** Resume files are stored via a `StorageBackend` interface
(local filesystem in dev, swappable for S3/GCS in production - see
[`docs/DESIGN.md`](docs/DESIGN.md) §5). Both the DB and file storage are external
to the API process, so it scales horizontally without sticky state once on
Postgres + object storage.
