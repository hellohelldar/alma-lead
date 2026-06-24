# Alma — Lead Management

A full-stack lead-management application for an immigration law firm.

- **Public lead intake** — a prospect submits their first name, last name, email, and resume/CV.
- **Automatic notifications** — on submission, both the prospect (confirmation) and an attorney (new-lead alert) are emailed.
- **Internal console** — an authenticated attorney views all leads and manually transitions each from `PENDING` → `REACHED_OUT` after reaching out.

**Stack:** FastAPI (async SQLAlchemy 2.0, Pydantic v2, Alembic) · Next.js (App Router, TypeScript, Tailwind) · SQLite/Postgres · Resend (with a zero-config console fallback) · local-filesystem storage (S3-ready).

See [`docs/DESIGN.md`](docs/DESIGN.md) for the system design and trade-offs, and [`docs/AGENTS.md`](docs/AGENTS.md) + [`NOTES.md`](NOTES.md) for the coding-agent usage writeup and attribution.

```
alma-lead/
├── backend/     FastAPI service (app/, alembic/, tests/)
├── frontend/    Next.js app (app/, components/, lib/)
├── docs/        DESIGN.md, AGENTS.md, openapi.json
└── docker-compose.yml
```

---

## Option A — Run locally (no Docker)

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

Submitted leads "send" two emails — without a `RESEND_API_KEY` these are printed to the
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

## Option B — Run with Docker Compose (Postgres)

Brings up Postgres + the API + the web app together (production-like):

```bash
docker compose up --build
```

- Web app → http://localhost:3000
- API → http://localhost:8000/docs

Override secrets/credentials via environment or a root `.env` consumed by Compose
(`JWT_SECRET`, `ATTORNEY_PASSWORD`, `RESEND_API_KEY`, …). The backend runs `alembic upgrade head`
on startup.

---

## Tests

```bash
cd backend && source .venv/bin/activate
pytest -q                 # backend API suite

cd ../frontend
npm run build             # type-checks + production build
```

---

## Configuration reference

Backend env (`backend/.env.example`): `DATABASE_URL`, `JWT_SECRET`, `ACCESS_TOKEN_EXPIRE_MINUTES`,
`ATTORNEY_EMAIL`, `ATTORNEY_PASSWORD`, `ATTORNEY_NAME`, `RESEND_API_KEY`, `EMAIL_FROM`,
`ATTORNEY_NOTIFY_EMAIL`, `STORAGE_DIR`, `MAX_UPLOAD_BYTES`, `CORS_ORIGINS`.

Frontend env (`frontend/.env.example`): `NEXT_PUBLIC_API_BASE_URL`.

### Switching to Postgres without Docker

```bash
# backend/.env
DATABASE_URL=postgresql+asyncpg://alma:alma@localhost:5432/alma
```

Then `alembic upgrade head` and run as usual.
