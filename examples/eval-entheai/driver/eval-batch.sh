#!/usr/bin/env bash
# dsh-eval batch driver — run the eval-entheai benchmark N attempts against the
# configured entheai backend, grade each, append a JSONL ledger entry.
# Usage: ./driver/eval-batch.sh [attempts] [ledger]
set -euo pipefail

LEAF="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO="$(cd "$LEAF/../.." && pwd)"
ATTEMPTS="${1:-3}"
LEDGER="${2:-$LEAF/driver/results.jsonl}"
OUTDIR="$LEAF/driver/outputs"

export ENTHEAI_BASE_URL="${ENTHEAI_BASE_URL:-http://127.0.0.1:8000/v1}"
export ENTHEAI_API_KEY="${ENTHEAI_API_KEY:-entheai-local}"

mkdir -p "$OUTDIR" "$(dirname "$LEDGER")"
echo "== dsh-eval batch: $ATTEMPTS attempts over entheai ($ENTHEAI_BASE_URL)"

cd "$REPO"
for i in $(seq 1 "$ATTEMPTS"); do
  OUT="$OUTDIR/attempt-$i.txt"
  if pnpm dsh --profile headless --patch "$LEAF/entheai.cordis.yml" "$(cat "$LEAF/task.md")" > "$OUT" 2>/dev/null; then
    VERDICT="FAIL"
    python3 "$LEAF/grader.py" "$OUT" >/dev/null 2>&1 && VERDICT="PASS"
  else
    VERDICT="ERROR"
  fi
  python3 - "$LEDGER" "$i" "$VERDICT" "$OUT" <<'PY'
import json, sys, time
ledger, attempt, verdict, out = sys.argv[1], int(sys.argv[2]), sys.argv[3], sys.argv[4]
with open(ledger, "a") as f:
    f.write(json.dumps({"ts": int(time.time()), "attempt": attempt, "verdict": verdict, "output": out}) + "\n")
PY
  echo "  attempt $i: $VERDICT"
done
echo "== done. ledger: $LEDGER (summarize with tabulate.py)"
