# Coding-Agent Usage

_How this project was built with coding agents. Attribution per file is in [`NOTES.md`](../NOTES.md)._

## Tools

- **Claude Code (Opus 4.8)** as the primary driver — architecture, the backend backbone, integration, verification, and orchestration of sub-agents.
- **Claude Code sub-agents** (the `Agent` tool) — three were spawned in parallel for independent, well-scoped slices of work, each confined to a non-overlapping directory so they could not conflict.
- **Cursor Agent (Composer)** — a follow-up session after the initial build, for hands-on verification, onboarding Q&A, and small infra/doc changes (see below).

## Follow-up — Cursor Agent (Composer)

After the repo was feature-complete, I switched to **Cursor** (Agent mode, **Composer** model) for a second pass. Claude Code had already shipped the app; I didn't need more greenfield architecture — I needed someone embedded in the IDE who could **run** the stack, answer questions while I read the code, and land small cross-cutting tweaks without reopening the original Claude session.

**Why Composer instead of Claude Code here:**

| Need | Why Composer fit |
|------|------------------|
| "Start it and let me click around" | Full terminal + repo access in Cursor; can spawn/restart `uvicorn`, `npm run dev`, and Docker in the background while I test in the browser. |
| "What is Alembic / SQLAlchemy / schemas vs models?" | Exploratory Q&A against the open files — no delegation setup, just chat while navigating `backend/`. |
| Docker smoke test + policy docs | Incremental edits to `docker-compose.yml`, README, deploy notes, then `docker compose up` + `scripts/smoke.sh` in one loop. |
| Commit + push | Git workflow in the same session once the diff looked right. |

**What Composer did in that session:**

| Area | Author | Why |
|------|--------|-----|
| Local dev bootstrap — venv, `alembic upgrade head`, run backend + frontend, API smoke (health, login, lead CRUD) | **Cursor (Composer)** | Operational verification before manual UI testing; caught `CORS_ORIGINS` JSON format in copied `.env`. |
| Conceptual onboarding (Alembic, SQLAlchemy, Pydantic schemas, Django ORM analogies) | **Cursor (Composer)** | Reading-comprehension pass — no code changes, just mapping the stack to things I already know. |
| `docker-compose.sqlite.yml`, Postgres-as-default docs, root `.env.example`, `CORS_ORIGINS` fix in default compose | **Cursor (Composer)** | Clarify DB policy: Postgres for staging/prod/CI/default Docker; SQLite optional for local Docker only. Ran SQLite stack + full smoke test, then committed and pushed. |
| Process hygiene — restart/kill dev servers when background tasks died | **Cursor (Composer)** | Keeps the "test it yourself" loop unblocked without me hunting PIDs. |

Composer did **not** rewrite the API, frontend, or CI pipelines — those stayed Claude Code's work. This session was complementary: **run, explain, polish, ship.**

**Representative prompts (excerpts):**

> check the full project and start it and test it … so that I can test it manually

> what is alembic / why we use alchemy / difference between schemas and lead?

> let's test the docker … make postgres default for staging and prod but for local docker u can choose sqlite

> commit to the main … push

## What I delegated vs. wrote myself, and why

| Area | Author | Why |
|------|--------|-----|
| Backend backbone — config, async SQLAlchemy model, JWT/bcrypt auth, pluggable email + storage services, lead routes, Alembic | **Hand-driven** (main session) | It's the API contract and the source of truth the rest of the system depends on. I wanted to own the data model, the public/protected boundary, and the service abstractions directly, then verify them E2E before anything was built on top. |
| Next.js frontend (public form, login, protected console) | **Delegated** sub-agent | A large, self-contained slice with a fixed contract (the exported `docs/openapi.json`). Parallelizable and low-risk once the API was frozen. |
| Backend pytest suite (29 tests) | **Delegated** sub-agent | Independent of app code; best written by a fresh perspective reading the contract rather than the author rationalizing their own implementation. |
| `docs/DESIGN.md` | **Delegated** sub-agent | A writing task over a finished implementation — ideal for fan-out. |
| CI/CD — `.github/` workflows + composite actions, `deploy/` stack (Compose + Caddy), sharded tests, smoke tests | **Hand-driven** | Modeled on the team's existing reference pipelines (read first, then adapted to a two-service monorepo). Pipeline correctness can't be judged from a diff, so I validated locally (YAML, `docker compose config`, actionlint, real `pytest --splits` shards, a real Compose smoke run) and watched the real CI run go green — work I wanted to own end-to-end. |
| Integration testing, `docker-compose.yml`, README, this doc | **Hand-driven** | Cross-cutting glue that needs the whole picture; I ran the real two-server round-trip myself. |

The split was deliberate: **freeze the contract by hand, then fan out everything that depends only on the contract.** I exported the OpenAPI spec and handed it to the frontend and test agents so all three worked against the same frozen interface in parallel.

## Where an agent produced subtly bad code — and how I caught it

**Delegated frontend agent — a `.gitignore` that would have silently dropped a required deliverable.** `create-next-app` generated a `.gitignore` containing `.env*`, which also matches `.env.example`. The agent was explicitly asked to ship `frontend/.env.example` and did create the file — but the ignore rule meant it would never have been committed. The agent even *noted the conflict in its report* yet shipped it unresolved. I caught it by running `git check-ignore frontend/.env.example` during the integration pass (it printed the path → ignored), and fixed it with a `!.env.example` negation. A "build passes" check would never have surfaced this; only checking what git would actually commit did.

**Main-session code — a runtime-only auth bug.** My first cut of password hashing used `passlib[bcrypt]`. It imported fine and looked idiomatic, but `passlib 1.7.4` is incompatible with `bcrypt 4.x` (it reads a removed `bcrypt.__about__` attribute), so the very first `hash_password()` call blew up at runtime. Import-level checks passed; only actually *running* the smoke test exposed it. Fixed by dropping passlib and calling the `bcrypt` library directly (also handling its 72-byte input cap). A second, milder case caught by review-before-run: an early draft validated the form email with `EmailStr._validate(...)`, which isn't a real Pydantic v2 API — replaced with a `TypeAdapter(EmailStr)`.

**CI/CD — a pipeline that would have fired a guaranteed-failing deploy.** When I added the workflows, the first cut deployed staging on every push to `main`. Reasoning through what the *first* push would actually trigger (not just whether the YAML was valid) surfaced two problems: with no server/secrets it would fail at the deploy step *and* still push throwaway images to GHCR. I gated both deploy jobs behind opt-in flag variables so they no-op until infra exists — and confirmed it: the staging run on the real push **skipped cleanly** instead of going red. Separately, getting CI actually green meant fixing 8 `ruff` findings in my *own* backend code (e.g. `str, Enum` → `StrEnum`, whose `str()` semantics differ — so I re-ran the suite to confirm the 29 tests still passed).

**A config bug the smoke test surfaced — and a false positive that nearly hid it.** Adding a full-stack smoke test (Docker Compose: Postgres + built images) is what exposed the highest-impact bug. `CORS_ORIGINS` is a `list[str]` setting, and the Compose file passed it as a plain string (`http://localhost:3000`). pydantic-settings JSON-parses complex fields from the environment *before* field validators run, so the plain string raised a `SettingsError` at import — which crashed the container's `alembic upgrade head` and stopped the backend from ever starting. The trap: the smoke test first reported **PASS**, because a stale `uvicorn` I'd left on host port 8000 (using the Python default, never parsed from env) answered instead of the container. The contradiction — green smoke but an Alembic traceback and an empty Postgres `leads` table — is what gave it away. Fixes: (1) annotated the field with `NoDecode` + a validator that accepts both JSON-array and comma-separated forms, verified across all formats; (2) re-ran the smoke against the real container and confirmed the row landed in Postgres. The lesson reinforced the verification discipline: a smoke test is only trustworthy if you also confirm *what* answered it.

**Takeaway:** agents reliably produced plausible, well-structured code; the failures were the kind that pass static/import checks and only surface when you (a) actually run the full flow, (b) inspect what version control will really do, (c) reason about what a trigger will fire on its first real event, and (d) confirm which process actually served a "passing" check. Every delegated slice — and every pipeline — was gated on a real verification step before being accepted.

## Representative prompts (excerpts)

**Frontend sub-agent (excerpt):**
> Build the Next.js frontend for "Alma"… Work ONLY inside `frontend/`. … Base URL must come from `process.env.NEXT_PUBLIC_API_BASE_URL`. … `/leads` … a "Download resume" action (must fetch with the Bearer header, get a blob, and trigger a browser download — a plain `<a href>` won't work because the endpoint is authed) … On any 401 response, clear the token and redirect to `/login`. … **Verify before finishing (REQUIRED):** run `npm run build` and ensure the production build succeeds with no type errors.

**Test sub-agent (excerpt — the gotcha that mattered most):**
> `Settings` is loaded via `@lru_cache get_settings()` … your `conftest.py` MUST set environment variables (`DATABASE_URL`, `STORAGE_DIR`, unset `RESEND_API_KEY`) BEFORE importing `app.main`. … instantiate `TestClient` as a context manager (`with TestClient(app) as client:`) so the lifespan runs and tables are created. … All tests must pass. Iterate until green.

**Design-doc sub-agent (excerpt):**
> Write a high-quality system design document at `docs/DESIGN.md`. … Read the implementation files to be accurate. … Explain and justify each decision **with the alternative considered**: SQLite default but Postgres-ready; pluggable email + why emails are sent in a background task; pluggable storage; JWT single-account and how it extends to multi-user.

A fuller, consolidated prompt log — the human-level asks that drove each phase,
the verbatim sub-agent delegation prompts, and the Cursor/Composer follow-up —
lives in [`PROMPTS.md`](PROMPTS.md). The excerpts above are the load-bearing
parts of each delegation.
