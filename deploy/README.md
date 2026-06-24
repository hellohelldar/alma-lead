# Deployment & CI/CD

Three GitHub Actions workflows drive delivery, modeled on the team's existing
pipelines:

| Workflow | Trigger | What it does |
|----------|---------|--------------|
| [`ci.yml`](../.github/workflows/ci.yml) | PR to `main` (and pushes to `main`) | Backend lint (ruff) + tests (pytest, **sharded 3×** via `pytest-split`) + `alembic upgrade head` against a real Postgres; frontend lint (eslint) + production build; a **full-stack smoke test** (`docker compose` → `scripts/smoke.sh`). |
| [`staging.yml`](../.github/workflows/staging.yml) | push to `main` | Builds `backend`/`frontend` images → GHCR, deploys to the **staging** server, runs a **post-deploy smoke test** against the live URL, and maintains a moving `prerelease-main` draft release. |
| [`release.yml`](../.github/workflows/release.yml) | push of a `vX.Y.Z` tag (or manual dispatch) | Drafts a GitHub Release with auto-generated notes, validates the tag is on `main`, builds version-tagged images, deploys to **production**, runs a **non-destructive post-deploy smoke** (health + auth gate), then publishes the release as `latest`. |

Shared logic lives in two composite actions: [`build-and-push`](../.github/actions/build-and-push)
and [`deploy-stack`](../.github/actions/deploy-stack).

## How a change flows to production

```
PR ──CI──▶ merge to main ──staging.yml──▶ staging server + prerelease draft
                                   │
                          tag vX.Y.Z on main
                                   │
                                   ▼
                          release.yml ──▶ production server + published release
```

## Images

Pushed to GitHub Container Registry under the repo:

- `ghcr.io/<owner>/<repo>/backend`
- `ghcr.io/<owner>/<repo>/frontend`

Each build is tagged with an immutable tag (8-char SHA for staging, `vX.Y.Z`
for releases), a moving channel tag (`staging` / `production`), and a
`cache-<channel>` tag used with `--cache-from`.

## On the server

Each environment is an isolated Compose project in its own directory. Both
**staging and production always run Postgres** — the deploy stack has no SQLite
option; `DATABASE_URL` is always `postgresql+asyncpg://…`.

| Environment | Compose project | Directory |
|-------------|-----------------|-----------|
| staging | `alma-staging` | `/opt/alma/staging` |
| production | `alma-production` | `/opt/alma/production` |

The deploy step rsyncs [`deploy/docker-compose.yml`](docker-compose.yml),
[`deploy/Caddyfile`](Caddyfile), and a generated `.env`, then runs
`docker compose pull && up -d`. The backend image runs `alembic upgrade head`
on startup, so migrations apply before traffic is served. [Caddy](Caddyfile)
terminates TLS for `$DOMAIN` and routes `/api` + `/health` to the backend and
everything else to the frontend (same origin — no CORS needed in the browser).

Requirements per server: Docker + Docker Compose v2, an SSH user whose key is
in the repo secrets, and ports 80/443 open.

## Required GitHub configuration

Deploys are **opt-in**: the deploy jobs are skipped until you set the flag
variable, so these workflows are safe to merge before any server exists (CI
still runs on every PR). Flip them on once the server + secrets are ready:

- `STAGING_DEPLOY_ENABLED=true` — enables the staging deploy on push to `main`.
- `PRODUCTION_DEPLOY_ENABLED=true` — enables the production build+deploy on a `v*` tag (the release is still drafted while disabled).

Create two **Environments** (`staging`, `production`) — add reviewers to
`production` for a manual approval gate. CI reads everything else from
prefix-named **secrets** (sensitive) and **variables** (non-sensitive); the
prefix is stripped before the value is written into the stack `.env`.

### Variables (Settings → Secrets and variables → Actions → Variables)

| Staging | Production | Example |
|---------|------------|---------|
| `STAGING_API_BASE_URL` | `PRODUCTION_API_BASE_URL` | `https://staging.alma.example` — baked into the frontend bundle |
| `STAGING_DOMAIN` | `PRODUCTION_DOMAIN` | `staging.alma.example` — Caddy site address |
| `STAGING_CORS_ORIGINS` | `PRODUCTION_CORS_ORIGINS` | `["https://staging.alma.example"]` |
| `STAGING_ATTORNEY_EMAIL` | `PRODUCTION_ATTORNEY_EMAIL` | `attorney@alma.com` |
| `STAGING_ATTORNEY_NAME` | `PRODUCTION_ATTORNEY_NAME` | `Alma Attorney` |
| `STAGING_ATTORNEY_NOTIFY_EMAIL` | `PRODUCTION_ATTORNEY_NOTIFY_EMAIL` | `attorney@alma.com` |
| `STAGING_EMAIL_FROM` | `PRODUCTION_EMAIL_FROM` | `Alma <noreply@alma.example>` |

### Secrets (Settings → Secrets and variables → Actions → Secrets)

| Staging | Production | Purpose |
|---------|------------|---------|
| `STAGING_SERVER_IP` | `PRODUCTION_SERVER_IP` | SSH host |
| `STAGING_SERVER_USERNAME` | `PRODUCTION_SERVER_USERNAME` | SSH user |
| `STAGING_SSH_KEY` | `PRODUCTION_SSH_KEY` | SSH private key |
| `STAGING_POSTGRES_PASSWORD` | `PRODUCTION_POSTGRES_PASSWORD` | DB password |
| `STAGING_JWT_SECRET` | `PRODUCTION_JWT_SECRET` | JWT signing secret |
| `STAGING_ATTORNEY_PASSWORD` | `PRODUCTION_ATTORNEY_PASSWORD` | Attorney login password |
| `STAGING_RESEND_API_KEY` | `PRODUCTION_RESEND_API_KEY` | Resend key (omit to log emails instead) |

`GITHUB_TOKEN` (auto-provided) is used to push images to GHCR and manage releases.

## Cutting a release

```bash
git checkout main && git pull
git tag v1.0.0
git push origin v1.0.0
```

`release.yml` then drafts notes, builds `v1.0.0` images, deploys production, and
publishes the release. To re-run for an existing tag, use the workflow's
**Run workflow** button and pass the tag.
