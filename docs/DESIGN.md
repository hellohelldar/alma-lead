# Alma - Lead Intake & Attorney Console: System Design

## 1. Overview & Goals

Alma is an immigration law firm. This system captures inbound prospects ("leads")
from a public web form and gives the firm's attorneys an internal console to work
those leads to closure.

The system serves two distinct user types with deliberately different trust levels:

- **Public prospect (unauthenticated).** Submits a first name, last name, email,
  and a resume/CV file through a public form. They never log in. On submission
  they receive a confirmation email.
- **Internal attorney (authenticated).** Logs into a protected console, sees all
  leads with their submitted information, downloads resumes, and advances each
  lead's lifecycle state. They are alerted by email whenever a new lead arrives.

### Goals
- Capture leads reliably - the intake request must not fail just because a
  downstream system (email provider) is slow or down.
- Keep prospect data (especially resumes) private: never expose them on a public
  URL; gate everything internal behind authentication.
- Run with **zero external configuration** for local development and reviewers
  (no DB server, no API keys), while being a single config change away from a
  production-grade deployment (Postgres, S3, a real email provider).

### Non-goals (for this iteration)
Multi-tenant firms, multi-attorney assignment, billing, and a full CRM. The data
model and service boundaries are chosen so these can be added without a rewrite -
see §9.

---

## 2. Architecture

The system is a conventional three-tier app - a Next.js client, a FastAPI
service, and a relational database - plus two pluggable side dependencies (an
email provider and an object store) that are accessed through abstractions rather
than wired in directly.

```
                          ┌─────────────────────────────────────────┐
                          │            Next.js (App Router)           │
                          │  /        public lead-intake form         │
                          │  /login   attorney sign-in                │
                          │  /leads   protected console (JWT Bearer)  │
                          └───────────────┬───────────────────────────┘
                                          │  HTTPS / JSON + multipart
                                          │  Authorization: Bearer <JWT>
                                          ▼
        ┌──────────────────────────────────────────────────────────────────┐
        │                       FastAPI service (async)                      │
        │                                                                    │
        │   Public boundary            │   Protected boundary (JWT)          │
        │   ───────────────            │   ──────────────────────            │
        │   POST /api/leads            │   POST  /api/auth/login             │
        │                              │   GET   /api/auth/me                │
        │                              │   GET   /api/leads                  │
        │                              │   GET   /api/leads/{id}             │
        │                              │   PATCH /api/leads/{id}/state        │
        │                              │   GET   /api/leads/{id}/resume       │
        │                                                                    │
        │   ┌──────────────┐   ┌───────────────┐   ┌────────────────────┐    │
        │   │  SQLAlchemy  │   │ EmailBackend  │   │   StorageBackend   │    │
        │   │   (async)    │   │  (interface)  │   │    (interface)     │    │
        │   └──────┬───────┘   └───────┬───────┘   └─────────┬──────────┘    │
        └──────────┼───────────────────┼─────────────────────┼──────────────┘
                   │                   │                      │
                   ▼                   ▼                      ▼
        ┌─────────────────┐  ┌──────────────────┐  ┌────────────────────┐
        │   SQLite (dev)  │  │ Resend (prod) /  │  │  Local FS (dev) /  │
        │ Postgres (prod) │  │ Console (dev)    │  │  S3 / GCS (prod)   │
        └─────────────────┘  └──────────────────┘  └────────────────────┘
```

The two side dependencies are reached only through the `EmailBackend` and
`StorageBackend` interfaces, selected by a factory at runtime from environment
config. The route handlers never import a concrete provider - see §5.

### (a) Public lead submission - with async email fan-out

```
Prospect            FastAPI                 Storage      DB        BackgroundTasks
   │  POST /api/leads  │                       │          │             │
   │  (multipart form) │                       │          │             │
   │──────────────────>│                       │          │             │
   │            validate email                 │          │             │
   │            validate content-type          │          │             │
   │            read bytes; check non-empty     │          │             │
   │            & <= max_upload_bytes           │          │             │
   │                   │   save(key, bytes) ───>│          │             │
   │                   │   INSERT lead (PENDING) ──────────>│             │
   │                   │   commit ──────────────────────────>│            │
   │                   │   schedule send_lead_notifications ───────────>│  │
   │<──────201 LeadRead┤                                                 │
   │                   │                              (after response)   │
   │                   │     ┌───────── send_lead_notifications ─────────┘
   │                   │     ▼
   │                   │   asyncio.gather(
   │                   │       prospect confirmation email,
   │                   │       attorney new-lead alert)   ── best-effort, errors logged
```

The handler validates input, persists the resume to the storage backend, writes a
`leads` row in `PENDING`, commits, and then **schedules** the two emails via
FastAPI `BackgroundTasks`. The `201` is returned immediately; the emails are sent
after the response is flushed. Email failures are caught and logged inside
`send_lead_notifications` and never propagate - a flaky provider can degrade
notifications but can never lose a lead. Rationale in §5.

### (b) Internal review + state transition

```
Attorney         Next.js          FastAPI                DB / Storage
   │ enter creds    │  POST /api/auth/login │
   │───────────────>│──────────────────────>│ verify against seeded account
   │                │<──────── JWT ──────────┤ create_access_token(sub=email)
   │ store JWT (client-side), send as Bearer on every call
   │                │  GET /api/leads ──────>│ get_current_user (validate JWT)
   │                │                        │ SELECT ... filter/search/paginate
   │                │<──── LeadList ─────────┤
   │ click a lead   │  GET /api/leads/{id}/resume ─────> load(resume_key)
   │                │<── file (attachment) ──┤
   │ "Mark reached out"  PATCH /{id}/state {REACHED_OUT}
   │                │──────────────────────>│ UPDATE state; updated_at bumped
   │                │<──── LeadRead ─────────┤
```

Every protected route depends on `get_current_user`, which rejects the request
with `401` unless a valid, unexpired JWT whose subject matches the configured
attorney email is presented.

---

## 3. Data Model

A single table, `leads`. (Auth has no user table yet - see §5.)

| Column                | Type                         | Notes                                              |
|-----------------------|------------------------------|----------------------------------------------------|
| `id`                  | `String(36)` (UUID), **PK**  | Server-generated UUIDv4.                            |
| `first_name`          | `String(255)`, not null      | Trimmed on intake.                                 |
| `last_name`           | `String(255)`, not null      | Trimmed on intake.                                 |
| `email`               | `String(320)`, not null, **indexed** | 320 = RFC max email length; indexed for search. |
| `resume_key`          | `String(512)`, not null      | Logical storage key (`{lead_id}/{filename}`).      |
| `resume_filename`     | `String(512)`, not null      | Original filename, for `Content-Disposition`.      |
| `resume_content_type` | `String(128)`, not null      | MIME type, replayed on download.                   |
| `state`               | `Enum(PENDING, REACHED_OUT)`, not null, **indexed** | Lifecycle; non-native enum stored as string. |
| `created_at`          | `DateTime(tz)`, not null     | Defaults to now (UTC).                              |
| `updated_at`          | `DateTime(tz)`, not null     | `onupdate` bumps it - gives a "last touched" time.  |

### State machine

```
        submit
  (intake)  │
            ▼
     ┌──────────────┐    attorney marks reached out    ┌────────────────┐
     │   PENDING    │ ───────────────────────────────> │  REACHED_OUT   │
     └──────────────┘        PATCH /{id}/state          └────────────────┘
```

Every lead is born `PENDING`. The only transition is the attorney advancing it to
`REACHED_OUT` after making contact. The enum is stored as a **string, not a native
DB enum** (`native_enum=False`), so adding states (e.g. `IN_REVIEW`, `RETAINED`,
`CLOSED`) is a code change plus a backfill - no fragile `ALTER TYPE` migration that
differs across SQLite and Postgres.

### Design rationale

- **UUID primary keys.** IDs appear in URLs (`/api/leads/{id}`) that an attorney's
  browser hits. Sequential integers would leak lead volume and invite
  enumeration; UUIDs are non-guessable and let the client/an upstream system mint
  IDs without a DB round-trip (the resume `key` is derived from the id *before*
  the row is committed). They cost a little index locality, which is irrelevant at
  this scale.
- **Store a storage key, not the blob.** Resumes are persisted to the storage
  backend; the DB keeps only `resume_key` + `resume_filename` +
  `resume_content_type`. Keeping multi-megabyte BLOBs out of the row keeps the
  table small and fast to scan, lets the object store (CDN/S3) do what it is good
  at, and allows the storage layer to be swapped (local → S3) without touching the
  schema. Persisting filename and content-type lets `GET .../resume` reconstruct a
  faithful download response without re-deriving them.

---

## 4. API Design

Base prefix `/api`. `application/json` everywhere except intake, which is
`multipart/form-data` (it carries a file). Auth is HTTP Bearer (JWT).

| Method | Path                       | Auth      | Purpose                                                       |
|--------|----------------------------|-----------|---------------------------------------------------------------|
| GET    | `/health`                  | none      | Liveness check.                                               |
| POST   | `/api/leads`               | **none**  | Public intake: create a lead + upload resume; emails fan out. |
| POST   | `/api/auth/login`          | none      | Exchange attorney email + password for a JWT.                 |
| GET    | `/api/auth/me`             | Bearer    | Return the current authenticated attorney.                    |
| GET    | `/api/leads`               | Bearer    | List leads; `state` filter, `search`, `limit`/`offset`.       |
| GET    | `/api/leads/{id}`          | Bearer    | Fetch a single lead.                                          |
| PATCH  | `/api/leads/{id}/state`    | Bearer    | Transition lead state (e.g. → `REACHED_OUT`).                 |
| GET    | `/api/leads/{id}/resume`   | Bearer    | Stream the resume as an attachment.                           |

**Public vs protected boundary.** Exactly one endpoint is public: `POST
/api/leads`. Everything that reads or mutates lead data, and the resume download,
sits behind the `get_current_user` dependency. This keeps the attack surface
minimal and obvious: the only thing an anonymous caller can do is submit a lead.
List responses are envelope-shaped (`items`, `total`, `limit`, `offset`) so the
console can paginate without a second count call.

---

## 5. Key Design Decisions & Trade-offs

**SQLite default, Postgres-ready via one env var (async SQLAlchemy).**
`DATABASE_URL` defaults to `sqlite+aiosqlite:///./alma.db`; pointing it at
`postgresql+asyncpg://…` switches engines with no code change, because all data
access goes through async SQLAlchemy 2.0 and portable column types (string UUIDs,
non-native enums, tz-aware datetimes). *Alternative considered:* require Postgres
from day one. Rejected - it adds a setup burden for a reviewer/local dev with no
benefit at this scale, and the abstraction makes the upgrade trivial when load
demands it.

**Pluggable email service + background send.** `get_email_backend()` returns the
`ResendEmailBackend` (httpx against Resend's HTTP API - no SDK dependency) when
`RESEND_API_KEY` is set, otherwise a `ConsoleEmailBackend` that logs the message.
This means the app is fully exercisable locally with zero secrets, and production
is one env var away. Emails are sent from a **`BackgroundTasks` job after the
response**, and `send_lead_notifications` swallows and logs any error
(`asyncio.gather(..., return_exceptions=True)`). *Why:* email is a slow, flaky
third-party call on the critical path of revenue-bearing intake. Blocking the
request on it would add hundreds of ms of latency and, worse, let a provider
outage turn into lost leads (the prospect sees a 500 and leaves). Delivery is
therefore **best-effort and decoupled** from persistence. *Alternative:* send
synchronously and surface failures - rejected because losing the lead is far worse
than a missed notification, which can be retried or alerted on.

**Pluggable storage abstraction; files out of the DB.** `StorageBackend` exposes
`save`/`load`/`exists` over a logical key. `LocalStorage` writes to the filesystem
now; the factory has a documented seam to return an `S3Storage`/`GcsStorage`
keyed off a setting. *Why files aren't in the DB:* see §3 - blobs bloat the table,
hurt backup/replication, and can't be served via a CDN. The abstraction means the
swap is invisible to the route handlers and the schema.

**JWT + single seeded attorney account.** Login compares against an attorney
email/password seeded from env (password hashed once at import with bcrypt, never
stored plaintext) and issues a stateless HS256 JWT whose `sub` is the email.
Protected routes validate the signature, expiry, and subject. *Why:* the brief has
one attorney; a stateless token needs no session store and scales horizontally for
free. *How it extends to real multi-user auth:* introduce a `users` table (id,
email, `password_hash`, role), have login look users up there, put `user_id` in
the JWT `sub`, add **refresh tokens** for longer sessions with short access-token
lifetimes, and gate routes by **role (RBAC)** - none of which disturbs the route
shapes. *Alternative:* server-side sessions - rejected as unnecessary state for a
single-attorney, API-first design.

**Resume via an authenticated download endpoint, not a public URL.** Resumes are
fetched through `GET /api/leads/{id}/resume`, which requires a valid JWT and
streams the bytes with the original filename/content-type. *Why:* a resume is
sensitive PII; a public or guessable URL would leak it. UUID ids further prevent
enumeration. *Production evolution:* swap the proxy-stream for a short-lived
**signed URL** from S3/GCS so the bytes never transit the app server, while still
gating issuance behind auth.

---

## 6. Security Considerations

Implemented today:
- **Auth boundary.** All lead read/mutate/download routes require a valid JWT via
  `HTTPBearer`; `auto_error=False` lets us return clean `401`s with
  `WWW-Authenticate`. Tokens are signed (HS256) and expiry-checked.
- **Credential handling.** Attorney password is bcrypt-hashed at startup and never
  compared in plaintext on the hot path. Secrets (`JWT_SECRET`, `RESEND_API_KEY`,
  DB URL, attorney password) come from env / `.env`, never from code.
- **Upload validation.** Content-type is allow-listed to PDF/DOC/DOCX; empty files
  are rejected (`422`); size is capped at `max_upload_bytes` (10 MB → `413`).
- **Traversal-safe storage keys.** Keys are server-generated (`{uuid}/{filename}`),
  the filename has `/` stripped, and `LocalStorage` additionally strips `..` and
  leading slashes before joining to the root - a defense-in-depth guard against
  path traversal even though keys aren't user-controlled.
- **CORS** is restricted to a configured origin list (default
  `http://localhost:3000`), not a wildcard.

To harden for production:
- **Rate-limit / CAPTCHA the public `POST /api/leads`** - it is the one anonymous,
  write-and-email endpoint and is the obvious spam/DoS target.
- **Virus/malware scan uploads** (e.g. ClamAV or an S3-event scanner) before an
  attorney ever opens a resume; quarantine on detection.
- **Signed URLs** for resume delivery (see §5) and **HTTPS/HSTS** everywhere (TLS
  terminated at the load balancer).
- **Magic-byte / content sniffing** in addition to the declared MIME type, since
  `content-type` is client-supplied.
- **Real secret management** (rotation of `JWT_SECRET` and attorney password via a
  secrets manager), and per-user credentials once the `users` table lands.

---

## 7. Production-Readiness & Scaling

- **Migrations.** Alembic is the source of truth for schema; `0001_initial`
  creates `leads` with its email/state indexes. The app's startup `create_all` is
  a dev convenience and a no-op once migrated - production runs `alembic upgrade
  head` on deploy.
- **SQLite → Postgres.** Set `DATABASE_URL` to an `asyncpg` DSN; the async engine,
  portable types, and Alembic migrations carry over unchanged. Postgres unlocks
  concurrent writes, connection pooling, and real full-text/`ILIKE` search.
- **Local → S3.** Implement `S3Storage` against the existing `StorageBackend`
  interface and return it from the factory on a `STORAGE_BACKEND` setting; no
  handler or schema change.
- **Emails under load.** `BackgroundTasks` runs in-process, so work is lost if the
  worker dies mid-task and there is no retry. The escape hatch is to make
  `send_lead_notifications` **enqueue** a job (Celery + Redis, or SQS + a worker)
  instead of running inline - giving durable retries, backoff, and dead-letter
  handling. The call site barely changes because the send is already isolated
  behind one function.
- **Statelessness & horizontal scaling.** Auth is a stateless JWT and storage is
  externalized, so the API has no per-instance state - run N replicas behind a load
  balancer. The only thing forcing it stateful today is `LocalStorage` (writes to
  the instance's disk); moving to S3 removes that and makes scale-out clean.
- **Observability.** Standard logging is wired (`alma.email` logger, etc.). For
  production add structured JSON logs with request IDs, metrics (intake rate,
  email success/failure, latency), error tracking (Sentry), and an alert on the
  email-failure log line so silent notification drops are caught.

---

## 8. Delivery: CI/CD & Environments

Three GitHub Actions pipelines move a change from PR to production. Full operator
docs (required secrets/variables, server prerequisites) live in
[`deploy/README.md`](../deploy/README.md).

```
PR ──CI──▶ merge to main ──staging──▶ staging server + moving prerelease draft
                                  │
                         tag vX.Y.Z on main
                                  │
                                  ▼
                       release ──▶ production server + published release
```

- **CI** (`ci.yml`, on PR + push to `main`). Backend `ruff` lint; `pytest` **sharded
  three ways** as a parallel matrix (via `pytest-split`) so the suite scales as it
  grows; a dedicated job that runs `alembic upgrade head` against a real Postgres
  service - the same command the container runs at startup, so a migration that
  would break the prod boot fails the PR instead; frontend `eslint` + production
  `next build` (which type-checks); and a **full-stack smoke test** that brings up
  the Docker Compose stack (Postgres + API + web) and runs the whole lead lifecycle
  through HTTP (`scripts/smoke.sh`). The migration and smoke jobs are the
  highest-signal "would prod actually work?" gates - unit tests pass against
  SQLite, but only the smoke job exercises the built images against Postgres.
- **Staging** (`staging.yml`, on push to `main`). Builds the backend and frontend
  images, pushes them to GHCR, deploys to the staging server, runs a full
  post-deploy smoke test against the live staging URL (staging can tolerate a
  test lead), and maintains a single moving `prerelease-main` draft release whose
  notes are the commits since the last draft - an always-current view of "what's
  on staging."
- **Release** (`release.yml`, on a `vX.Y.Z` tag). Drafts a GitHub Release with notes
  generated from the commit range since the previous tag, **validates the tagged
  commit is reachable from `main`** (no releasing off a stray branch), builds
  version-tagged images, deploys production, runs a **non-destructive** post-deploy
  smoke check (health + auth gate only - production must not accrue test leads or
  fire real emails), then flips the release from draft to `latest`. Tag-driven
  releases give an immutable, auditable artifact per version.

**Environments & isolation.** Staging and production are separate GitHub
*Environments* (production can require a reviewer for a manual approval gate) and
separate Compose projects in separate directories on (potentially) separate
servers. Per-environment config is namespaced by a `STAGING_` / `PRODUCTION_`
secret+variable prefix that CI strips when synthesizing the stack `.env`, so the
two environments never share credentials. Deploys are **opt-in** behind a flag
variable, so the pipelines are safe to merge and exercise via CI before any server
exists.

**Image & deploy strategy.** Each service is a separate GHCR image tagged with an
immutable id (8-char SHA for staging, the version tag for releases) plus a moving
channel tag and a `cache-<channel>` tag used with `--cache-from`. Because the
frontend bakes `NEXT_PUBLIC_API_BASE_URL` at build time, its image is
environment-specific - built with each environment's public origin. The deploy
step is plain SSH + `rsync` of the [deploy Compose file](../deploy/docker-compose.yml)
and a generated `.env`, then `docker compose pull && up -d`. [Caddy](../deploy/Caddyfile)
fronts the stack: it auto-provisions TLS for the environment's domain and routes
`/api` + `/health` to the backend and everything else to the frontend, so the
browser talks to a single origin (no CORS in the browser path). Schema migrations
apply automatically on deploy via the backend image's startup `alembic upgrade head`.

The build/deploy mechanics are factored into two composite actions
(`build-and-push`, `deploy-stack`) shared by the staging and release workflows, so
the two environments differ only in inputs, not in logic.

---

## 9. Future Work

With more time, in rough priority order:

- **Audit log of state changes** - who moved a lead to `REACHED_OUT` and when. The
  schema already carries `updated_at`; a dedicated `lead_events` table would give a
  full, queryable history.
- **Lead notes / activity timeline** so an attorney can record call outcomes.
- **Multi-attorney support** - `users` table, RBAC, refresh tokens (per §5), and
  **lead assignment** (an `assigned_to` FK) so leads route to a specific attorney.
- **Richer lifecycle** - more states (`IN_REVIEW`, `RETAINED`, `CLOSED`) with
  enforced legal transitions, made cheap by the string-stored enum.
- **Cursor-based pagination** for the list endpoint to stay stable under heavy
  insert volume (offset pagination drifts as new leads arrive).
- **Webhook / CRM integration** - push new leads to Salesforce/HubSpot, and accept
  inbound webhooks, reusing the same decoupled background/queue path as email.
- **Tests.** A test suite is present; expand coverage of the auth boundary, upload
  validation edges, and the background-email path with the console backend.
