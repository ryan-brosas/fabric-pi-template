#!/usr/bin/env bash
# .pi/scripts/night-run.sh — cron-safe trigger for the autonomous /night pipeline.
#
# Ensures a persistent Pi agent pane exists for the repo, injects `/night`, waits
# for the run to finish, and fires a herdr notification. Cron-safe: no assumptions
# about an interactive UI; all herdr calls go through the socket API.
#
# Example crontab line (02:30 nightly, log to the pipeline artifact dir):
#   30 2 * * * /home/ryan/repo/swastika/.pi/scripts/night-run.sh >> /home/ryan/repo/swastika/.pi/artifacts/night-pipeline/night-run.cron.log 2>&1
#
# Environment overrides:
#   REPO_ROOT          repo path the Pi pane must be cwd'd in (default below)
#   PI_AGENT_NAME      unique name for a freshly started agent pane (default: pi-night)
#   PI_AGENT_ARGV      space-separated argv after `--` for `herdr agent start` (default: pi)
#   PICKUP_TIMEOUT_MS  ms to wait for the agent to pick up /night (default: 180000)
#   RUN_TIMEOUT_MS     ms to wait for the run to complete (default: 14400000 = 4h)
#   START_TIMEOUT_MS   ms to wait for a freshly started pane to go idle (default: 180000)

set -euo pipefail

REPO_ROOT="${REPO_ROOT:-/home/ryan/repo/swastika}"
PI_AGENT_NAME="${PI_AGENT_NAME:-pi-night}"
PI_AGENT_ARGV="${PI_AGENT_ARGV:-pi}"
PICKUP_TIMEOUT_MS="${PICKUP_TIMEOUT_MS:-180000}"
RUN_TIMEOUT_MS="${RUN_TIMEOUT_MS:-14400000}"
START_TIMEOUT_MS="${START_TIMEOUT_MS:-180000}"

LOG_DIR="$REPO_ROOT/.pi/artifacts/night-pipeline"
LOG_FILE="$LOG_DIR/night-run.log"

mkdir -p "$LOG_DIR"

log() {
  local ts
  ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf '[%s] %s\n' "$ts" "$*" | tee -a "$LOG_FILE" >&2
}

# Emit one TSV line per agent: pane_id \t agent_status \t cwd \t agent
emit_agents() {
  local json="$1"
  if command -v jq >/dev/null 2>&1; then
    printf '%s' "$json" | jq -r '
      .result.agents[]?
      | [.pane_id, .agent_status, .cwd, (.agent // "")] | @tsv
    '
  else
    printf '%s' "$json" | python3 -c '
import json, sys
d = json.load(sys.stdin)
for a in d.get("result", {}).get("agents", []):
    print("\t".join([
        a.get("pane_id", ""),
        a.get("agent_status", ""),
        a.get("cwd", ""),
        a.get("agent", "") or "",
    ]))
'
  fi
}

# Print the agent_status of a pane_id, or empty if not found.
current_status() {
  local pane="$1"
  emit_agents "$(herdr agent list)" | awk -F'\t' -v p="$pane" '$1 == p { print $2; exit }'
}

notify() {
  local title="$1" body="${2:-}"
  if [[ -n "$body" ]]; then
    herdr notification show "$title" --body "$body" || true
  else
    herdr notification show "$title" || true
  fi
}

trap 'rc=$?; log "exit rc=$rc"; exit $rc' EXIT

log "night-run start: repo=$REPO_ROOT pid=$$"

# --- discover a usable Pi agent pane for the repo -------------------------------
PANE_ID=""
PANE_STATUS=""

discover() {
  local json pane status cwd agent
  PANE_ID=""
  PANE_STATUS="absent"
  json="$(herdr agent list)"
  while IFS=$'\t' read -r pane status cwd agent; do
    [[ "$cwd" == "$REPO_ROOT" && "$agent" == "pi" ]] || continue
    case "$status" in
      idle)
        [[ -z "$PANE_ID" || "$PANE_STATUS" != "working" ]] || continue
        PANE_ID="$pane"; PANE_STATUS="idle"
        ;;
      working)
        PANE_ID="$pane"; PANE_STATUS="working"; return 0
        ;;
    esac
  done < <(emit_agents "$json")
}

discover

if [[ "$PANE_STATUS" == "working" ]]; then
  log "a /night run is already in progress on pane $PANE_ID; not double-injecting"
  notify "night-run skipped" "A run is already in progress (pane $PANE_ID)."
  exit 0
fi

# --- start a fresh pane if no idle one exists ------------------------------------
if [[ "$PANE_STATUS" != "idle" ]]; then
  log "no idle pi agent pane for $REPO_ROOT (status=$PANE_STATUS); starting '$PI_AGENT_NAME'"
  # shellcheck disable=SC2086 # intentional word-splitting of PI_AGENT_ARGV
  herdr agent start "$PI_AGENT_NAME" --cwd "$REPO_ROOT" -- $PI_AGENT_ARGV
  log "waiting for started pane to reach idle (timeout ${START_TIMEOUT_MS}ms)"
  local_start_deadline=$(( $(date +%s) + START_TIMEOUT_MS / 1000 ))
  while :; do
    discover
    if [[ "$PANE_STATUS" == "idle" && -n "$PANE_ID" ]]; then
      break
    elif [[ "$PANE_STATUS" == "working" ]]; then
      log "started pane is already working; treating as in-progress"
      notify "night-run skipped" "Started pane went working (pane $PANE_ID)."
      exit 0
    fi
    if [[ $(date +%s) -ge $local_start_deadline ]]; then
      log "ERROR: started pane did not reach idle within ${START_TIMEOUT_MS}ms"
      notify "night-run failed" "Started pane did not become idle (timeout)."
      exit 1
    fi
    sleep 2
  done
  log "started pane idle: $PANE_ID"
fi

log "using pane $PANE_ID (status=$PANE_STATUS)"

# --- inject /night ---------------------------------------------------------------
# `herdr pane run` sends text + Enter; `herdr agent send` only types literal text
# (no Enter) and would leave /night unsubmitted.
log "injecting /night on pane $PANE_ID"
if ! herdr pane run "$PANE_ID" '/night'; then
  log "ERROR: herdr pane run failed"
  notify "night-run failed" "herdr pane run failed on pane $PANE_ID."
  exit 1
fi

# --- wait for completion ---------------------------------------------------------
# Confirm the agent picked up the command (idle -> working), then wait for it to
# return to idle. A very fast null result may flip idle->working->idle between
# polls; if we miss `working` and find it idle, treat that as completed.
sleep 2
outcome="failed"
if herdr wait agent-status "$PANE_ID" --status working --timeout "$PICKUP_TIMEOUT_MS"; then
  log "agent picked up /night; waiting for completion (timeout ${RUN_TIMEOUT_MS}ms)"
  if herdr wait agent-status "$PANE_ID" --status idle --timeout "$RUN_TIMEOUT_MS"; then
    log "night run completed (status=idle)"
    outcome="success"
  else
    log "ERROR: night run timed out after ${RUN_TIMEOUT_MS}ms"
    outcome="timeout"
  fi
else
  cur="$(current_status "$PANE_ID" || true)"
  log "agent did not transition to working within ${PICKUP_TIMEOUT_MS}ms; current status=$cur"
  if [[ "$cur" == "idle" ]]; then
    log "agent is idle; treating as completed (possible instant null result)"
    outcome="success"
  else
    outcome="no-pickup:$cur"
  fi
fi

# --- notify ----------------------------------------------------------------------
case "$outcome" in
  success)
    notify "night-run done" "Check for a draft PR on a night/* branch for $REPO_ROOT. Log: $LOG_FILE"
    ;;
  timeout)
    notify "night-run timed out" "/night did not finish within ${RUN_TIMEOUT_MS}ms on pane $PANE_ID. Log: $LOG_FILE"
    exit 1
    ;;
  *)
    notify "night-run failed" "outcome=$outcome pane=$PANE_ID. Log: $LOG_FILE"
    exit 1
    ;;
esac

log "night-run end: outcome=$outcome"
