#!/usr/bin/env bash
#
# End-to-end smoke test: exercises the full lead lifecycle against a running
# stack. Used by CI against the Docker Compose stack and by the deploy
# workflows against the live environment after a release.
#
# Usage:
#   scripts/smoke.sh [API_BASE] [WEB_BASE]
#   API_BASE=https://staging.alma.example scripts/smoke.sh
#
# Env:
#   API_BASE   API origin (default http://localhost:8000)
#   WEB_BASE   optional web origin to also probe (e.g. http://localhost:3000)
#   ATTORNEY_EMAIL / ATTORNEY_PASSWORD  login creds (default seeded dev creds)
#   HEALTH_ONLY  if set to 1, run only the non-destructive checks (health +
#                auth gate) — used as a post-deploy probe in production so we
#                don't create junk leads or send real emails on every release.
#
# Exits non-zero on the first failed check.
set -euo pipefail

API_BASE="${1:-${API_BASE:-http://localhost:8000}}"
WEB_BASE="${2:-${WEB_BASE:-}}"
EMAIL="${ATTORNEY_EMAIL:-attorney@alma.com}"
PASSWORD="${ATTORNEY_PASSWORD:-changeme}"

API_BASE="${API_BASE%/}"
WEB_BASE="${WEB_BASE%/}"

say() { printf '\n\033[1m▶ %s\033[0m\n' "$*"; }
fail() { printf '\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }
ok() { printf '\033[32m✓ %s\033[0m\n' "$*"; }

say "Smoke test against $API_BASE"

# 1. Wait for the API to become healthy (migrations + startup can take a moment).
say "Waiting for /health"
for i in $(seq 1 60); do
  if curl -fsS "$API_BASE/health" >/dev/null 2>&1; then
    ok "health is up (after ${i}s)"
    break
  fi
  [ "$i" -eq 60 ] && fail "API never became healthy at $API_BASE/health"
  sleep 1
done

# 2. List requires auth (non-destructive — also the production liveness gate).
say "Verifying auth gate"
CODE="$(curl -s -o /dev/null -w '%{http_code}' "$API_BASE/api/leads")"
[ "$CODE" = "401" ] || fail "unauthenticated list should be 401, got $CODE"
ok "unauthenticated list is 401"

if [ "${HEALTH_ONLY:-0}" = "1" ]; then
  say "HEALTH_ONLY set — skipping destructive checks. SMOKE (health) PASSED ✅"
  exit 0
fi

# 3. Public lead submission (multipart) -> 201 + PENDING.
say "Submitting a public lead"
RESUME="$(mktemp -t smoke-resume.XXXXXX).pdf"
printf '%%PDF-1.4 smoke-test resume' > "$RESUME"
EMAIL_PROSPECT="smoke+$(date +%s)@example.com"
CREATE_BODY="$(curl -fsS -X POST "$API_BASE/api/leads" \
  -F "first_name=Smoke" -F "last_name=Test" -F "email=$EMAIL_PROSPECT" \
  -F "resume=@$RESUME;type=application/pdf")" || fail "lead submission failed"
LEAD_ID="$(printf '%s' "$CREATE_BODY" | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d["state"]=="PENDING"; print(d["id"])')" \
  || fail "lead not created with PENDING state: $CREATE_BODY"
ok "lead created: $LEAD_ID"

# 4. Login -> JWT.
say "Logging in as attorney"
TOKEN="$(curl -fsS -X POST "$API_BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])')" \
  || fail "login failed"
ok "got access token"
AUTH=(-H "Authorization: Bearer $TOKEN")

# 5. The new lead shows up in the authenticated list.
say "Listing leads"
curl -fsS "${AUTH[@]}" "$API_BASE/api/leads" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); assert d['total']>=1, d; assert any(i['id']=='$LEAD_ID' for i in d['items']), 'new lead missing'" \
  || fail "lead not present in list"
ok "lead present in list"

# 6. State transition PENDING -> REACHED_OUT.
say "Transitioning state"
curl -fsS -X PATCH "${AUTH[@]}" -H 'Content-Type: application/json' \
  -d '{"state":"REACHED_OUT"}' "$API_BASE/api/leads/$LEAD_ID/state" \
  | python3 -c 'import json,sys; assert json.load(sys.stdin)["state"]=="REACHED_OUT"' \
  || fail "state transition failed"
ok "state is REACHED_OUT"

# 7. Resume download returns the bytes we uploaded.
say "Downloading resume"
DL="$(mktemp)"
curl -fsS "${AUTH[@]}" "$API_BASE/api/leads/$LEAD_ID/resume" -o "$DL" || fail "resume download failed"
cmp -s "$RESUME" "$DL" || fail "downloaded resume differs from upload"
ok "resume bytes match"

# 8. Optional: web app is serving.
if [ -n "$WEB_BASE" ]; then
  say "Probing web app at $WEB_BASE"
  CODE="$(curl -s -o /dev/null -w '%{http_code}' "$WEB_BASE/")"
  [ "$CODE" = "200" ] || fail "web app returned $CODE"
  ok "web app responds 200"
fi

rm -f "$RESUME" "$DL"
say "SMOKE TEST PASSED ✅"
