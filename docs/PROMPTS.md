# Representative Prompt Logs

Excerpts from the sessions that built this project, satisfying the
"representative prompt logs or session transcripts" submission requirement.
For the narrative of what was delegated vs. hand-written and why, see
[`AGENTS.md`](AGENTS.md); for per-file attribution see [`../NOTES.md`](../NOTES.md).

Two tools were used:

- **Claude Code (Opus 4.8)** — primary build: architecture, backend, orchestration of sub-agents, CI/CD, the Alma rebrand.
- **Cursor Agent (Composer)** — a follow-up session: run/verify the stack, onboarding Q&A, the Postgres-default DB policy + docs.

> These are representative excerpts, lightly trimmed with `…`. Claude Code and
> Cursor keep full local session transcripts; the load-bearing parts are
> reproduced here verbatim.

---

## 1. Human → orchestrator (the asks that drove each phase)

The whole app was driven from a handful of high-level prompts; the agent
decomposed each into the work below.

> **Initial build** — *"yo let's do this 🚀"* followed by the full Alma
> assignment brief (public lead form: first/last/email/résumé; emails to
> prospect + attorney on submit; auth-guarded internal list; `PENDING →
> REACHED_OUT`; FastAPI + Next.js; storage + email service; production-grade
> structure).

> **CI/CD** — *"add .github workflow and actions for ci/cd … add staging or
> dev environment (let's call it staging) and production and releases"* (with
> a sibling repo handed over as the reference for pipeline conventions).

> **Hardening** — *"recheck everything is in place … how to connect everything
> to PostgreSQL … for production … add that we have staging env, prod
> environment, releases and add smoke tests to ci/cd add sharding … add
> everything I told u to AGENTS.md."*

> **Rebrand** — *"design is super AIsh let's change it, use alma colors"* (with
> screenshots of tryalma.com).

> **Brand font** — *"here is font for the alma logo: Gellix …"* (with the
> `@font-face` snippet).

> Plus tighteners: *"how to start it"*, *"have u added it to the docs?"*,
> *"there is no Readme inside backend"*.

---

## 2. Orchestrator → sub-agents (verbatim delegation prompts)

After hand-writing the backend backbone and freezing the API contract
(`docs/openapi.json`), three sub-agents were spawned **in parallel**, each
scoped to a non-overlapping directory.

### Frontend sub-agent

> Build the Next.js frontend for "Alma", a lead-management app for an
> immigration law firm. Work ONLY inside `…/frontend/`. … Stack: Next.js 14+
> (App Router), TypeScript, Tailwind CSS. … Base URL must come from
> `process.env.NEXT_PUBLIC_API_BASE_URL`. …
> `POST /api/leads` — PUBLIC. multipart/form-data fields: `first_name`,
> `last_name`, `email`, `resume` … `GET /api/leads?state=&search=&limit=&offset=`
> — Bearer. …
> Pages: `/` public intake form with client-side validation + success state;
> `/login` stores the JWT and redirects to `/leads`; `/leads` PROTECTED — table
> with status badge, a "Download resume" action (**must fetch with the Bearer
> header, get a blob, and trigger a browser download — a plain `<a href>` won't
> work because the endpoint is authed**), a "Mark as Reached Out" button, state
> filter, debounced search, pagination. On any 401 response, clear the token
> and redirect to `/login`. …
> **Verify before finishing (REQUIRED):** run `npm install` then `npm run
> build` and ensure the production build succeeds with no type errors. Do not
> finish with a broken build.

### Backend test sub-agent

> Write a pytest test suite for an existing FastAPI backend. Work ONLY inside
> `…/backend/tests/`. Do NOT modify application code — if you find a real bug,
> note it in your final report instead. …
> **Critical setup notes (the gotchas):** `Settings` is loaded via
> `@lru_cache get_settings()` and `settings` is a module-level singleton, so
> your `conftest.py` MUST set environment variables (`DATABASE_URL` to a temp
> SQLite file, `STORAGE_DIR` to a tmp dir, unset `RESEND_API_KEY`) BEFORE
> importing `app.main`. … Instantiate `TestClient` as a context manager
> (`with TestClient(app) as client:`) so the lifespan runs and tables are
> created. …
> Cover: health; public intake happy path + validation (invalid email → 422,
> bad content-type → 422, empty → 422, oversized → 413); auth gate (401);
> login success/failure; list filters/search/pagination; 404s; state
> transition; resume download. …
> Run `pytest -q` and iterate until green. Aim for ~15–25 focused tests.

### Design-doc sub-agent

> Write a high-quality system design document at `docs/DESIGN.md`. Write ONLY
> that file. … Read the implementation files to be accurate. …
> Cover: Overview & goals; Architecture (an ASCII diagram: Next.js → FastAPI →
> DB + email + object storage, plus request flows for public submission with
> async email fan-out and internal review); Data model + the `PENDING →
> REACHED_OUT` state machine; API design table; **Key design decisions &
> trade-offs — explain each WITH the alternative considered** (SQLite default
> but Postgres-ready; pluggable email + why emails go in a background task;
> pluggable storage; JWT single-account and how it extends to multi-user);
> Security; Production-readiness & scaling; Future work.

---

## 3. Cursor Agent (Composer) — follow-up session

A second pass in the IDE to run the stack, learn it, and land the
Postgres-default DB policy.

> check the full project and start it and test it … so that I can test it manually

> what is alembic / why we use alchemy / difference between schemas and lead?

> let's test the docker … make postgres default for staging and prod but for local docker u can choose sqlite

> commit to the main … push
