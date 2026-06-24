# Attribution - agent-generated vs. hand-written

This project was built with Claude Code (Opus 4.8). The work splits into code driven
directly in the main session ("hand-driven": authored and verified turn-by-turn) and
code produced by delegated sub-agents working against a frozen API contract. See
[`docs/AGENTS.md`](docs/AGENTS.md) for the rationale and prompt excerpts.

Commits are also attributed: each carries a `Co-Authored-By: Claude` trailer, and the
commit body states whether the change was hand-driven or delegated.

## Hand-driven (main session)

Authored and verified directly; the API contract and integration glue.

- `backend/app/core/config.py` - settings
- `backend/app/core/security.py` - bcrypt hashing + JWT
- `backend/app/db/` - async engine/session, declarative base
- `backend/app/models/lead.py` - Lead model + state enum
- `backend/app/schemas/` - Pydantic schemas
- `backend/app/services/email/` - pluggable email backend (Resend + console) + templates
- `backend/app/services/storage/` - pluggable storage backend (local fs, S3-ready)
- `backend/app/api/` - deps, auth/leads/health routes
- `backend/app/main.py` - app wiring, CORS, lifespan
- `backend/alembic/` - async migration env + initial migration
- `backend/pyproject.toml`, `backend/Dockerfile`, `backend/.env.example`
- `docker-compose.yml`, `README.md`, `NOTES.md`, `docs/AGENTS.md`
- `.gitignore`, integration testing, and the fix to `frontend/.gitignore`
- `.github/` - CI (sharded tests + smoke) + staging/production deploy + release
  workflows and the `build-and-push` / `deploy-stack` composite actions (modeled
  on the team's existing Outtalent pipelines)
- `deploy/` - GHCR-image Compose stack, Caddyfile, deployment guide
- `scripts/smoke.sh` - end-to-end smoke test (CI + post-deploy)
- the `CORS_ORIGINS` `NoDecode` config fix (found via the smoke test - see
  `docs/AGENTS.md`)
- frontend rebrand to Alma's visual identity (cream + forest/sage palette,
  Poppins, pill buttons, peach/forest status chips) - theme tokens in
  `app/globals.css`, applied across components and all three pages; verified
  visually against tryalma.com via browser screenshots

## Delegated to sub-agents

Produced by parallel sub-agents, then reviewed and verified before acceptance.

- **`frontend/`** (entire Next.js app - pages, components, `lib/` API client, Dockerfile,
  README) - frontend sub-agent. Reviewed; fixed its `.gitignore` so the required
  `.env.example` is committed (see `docs/AGENTS.md`).
- **`backend/tests/`** (conftest + 29 tests) - test sub-agent. Verified green with `pytest -q`.
- **`docs/DESIGN.md`** - design-doc sub-agent. Reviewed for accuracy against the code.

## Verification performed by the main session

- Backend imports + bcrypt round-trip; `alembic upgrade head`; TestClient E2E smoke.
- Full two-server HTTP round-trip against the running stack: public multipart submit
  (201 + both emails fired), login, authed list, `PENDING → REACHED_OUT`, byte-identical
  resume download; CORS preflight from the web origin.
- `pytest -q` → 29 passed. `npm run build` → succeeds, type-clean.
