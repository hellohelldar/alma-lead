# Alma Lead API (backend)

FastAPI service powering the public lead intake and the internal attorney
console. Async SQLAlchemy 2.0, Pydantic v2, JWT auth, Alembic migrations, and
pluggable email + file-storage backends.

For the full-stack picture (frontend, Docker Compose, CI/CD) see the
[root README](../README.md); for architecture and trade-offs see
[`docs/DESIGN.md`](../docs/DESIGN.md).

## Quick start

Runs with zero configuration - SQLite + a console email backend by default, so
no database server or API keys are needed.

```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # or: uv venv && source .venv/bin/activate
pip install -e ".[dev]"                              # or: uv pip install -e ".[dev]"
cp .env.example .env                                 # optional; defaults work
alembic upgrade head                                 # create the schema
uvicorn app.main:app --reload
```

- API: http://localhost:8000
- Interactive docs (Swagger): http://localhost:8000/docs
- Health: http://localhost:8000/health

Submitted leads trigger two emails (prospect + attorney). Without a
`RESEND_API_KEY` these are printed to the server log; set one to send for real.

**Default attorney login:** `attorney@alma.com` / `changeme` (override in `.env`).

## Project layout

```
app/
  main.py            FastAPI app, CORS, startup lifespan
  core/              config (pydantic-settings) + security (bcrypt + JWT)
  db/                async engine/session, declarative base
  models/lead.py     Lead ORM model + LeadState enum
  schemas/           Pydantic request/response models
  services/
    email/           pluggable EmailBackend: Resend | console + templates
    storage/         pluggable StorageBackend: local fs (S3-ready)
  api/
    deps.py          auth dependency (current attorney)
    routes/          leads, auth, health
alembic/             migration env + versions
tests/               pytest suite (29 tests)
```

## API

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `POST` | `/api/leads` | public | Submit a lead (multipart: `first_name`, `last_name`, `email`, `resume`) → triggers emails |
| `GET` | `/api/leads` | bearer | List leads (`state`, `search`, `limit`, `offset`) |
| `GET` | `/api/leads/{id}` | bearer | Get one lead |
| `PATCH` | `/api/leads/{id}/state` | bearer | Transition state (`PENDING` → `REACHED_OUT`) |
| `GET` | `/api/leads/{id}/resume` | bearer | Download the resume |
| `POST` | `/api/auth/login` | public | Exchange credentials for a JWT |
| `GET` | `/api/auth/me` | bearer | Current attorney |
| `GET` | `/health` | public | Liveness check |

The exported OpenAPI spec is at [`docs/openapi.json`](../docs/openapi.json).

## Tests & lint

```bash
source .venv/bin/activate
pytest -q          # 29 tests (use a temp SQLite DB + console email; no network)
ruff check .       # lint (same gate CI runs)
```

## Migrations

Alembic is the source of truth for the schema.

```bash
alembic upgrade head                          # apply migrations
alembic revision --autogenerate -m "message"  # create a new migration after model changes
```

The app also runs `create_all` on startup as a dev convenience; it is a no-op
once migrations are applied. In Docker/production the container runs
`alembic upgrade head` before serving.

## Configuration

All settings come from environment variables (or a `.env` file); see
[`.env.example`](.env.example) for the full list with defaults.

| Variable | Default | Notes |
|----------|---------|-------|
| `DATABASE_URL` | `sqlite+aiosqlite:///./alma.db` | Use `postgresql+asyncpg://…` for Postgres |
| `JWT_SECRET` | dev value | Set a long random string in prod |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `720` | Token lifetime |
| `ATTORNEY_EMAIL` / `ATTORNEY_PASSWORD` / `ATTORNEY_NAME` | seeded account | The single attorney login |
| `ATTORNEY_NOTIFY_EMAIL` | `attorney@alma.com` | Where new-lead alerts are sent |
| `RESEND_API_KEY` | _(unset)_ | If set, emails send via Resend; otherwise logged |
| `EMAIL_FROM` | `Alma <onboarding@resend.dev>` | Sender address |
| `STORAGE_DIR` | `./uploads` | Local resume storage path |
| `MAX_UPLOAD_BYTES` | `10485760` | Max resume size (10 MB) |
| `CORS_ORIGINS` | `["http://localhost:3000"]` | Allowed origins - JSON array (`["https://a","https://b"]`) or comma-separated (`https://a,https://b`) |

### Swapping backends

- **Email** - implement `EmailBackend` and return it from
  `app/services/email/__init__.py:get_email_backend()`. Resend and console
  backends ship today.
- **Storage** - implement `StorageBackend` (e.g. `S3Storage`) and return it from
  `app/services/storage/__init__.py:get_storage()`. No route or schema changes.
