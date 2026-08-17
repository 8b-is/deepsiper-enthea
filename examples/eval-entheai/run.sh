#!/usr/bin/env bash
# One-shot eval-entheai runner: exports the env with sensible defaults, runs
# the headless dsh task over the self-hosted entheai route capturing stdout,
# grades the final assistant text, and echoes the verdict + exit code.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# pnpm workspace scripts resolve at the repo root; dsh runs from there.
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Shell default spelling of the loader's `?? 'http://127.0.0.1:8000/v1'`.
export ENTHEAI_BASE_URL="${ENTHEAI_BASE_URL:-http://127.0.0.1:8000/v1}"
# Most local OpenAI-compatible servers accept any non-blank key; the harness
# rejects only blank or header-hostile values.
export ENTHEAI_API_KEY="${ENTHEAI_API_KEY:-entheai-local}"

OUTPUT="$(mktemp -t eval-entheai.XXXXXX)"
ERR_LOG="$(mktemp -t eval-entheai-err.XXXXXX)"
trap 'rm -f "$OUTPUT" "$ERR_LOG"' EXIT

echo "== dsh --profile headless over entheai (${ENTHEAI_BASE_URL})"
set +e
(
  cd "$REPO_ROOT"
  pnpm dsh --profile headless \
    --patch "$SCRIPT_DIR/entheai.cordis.yml" \
    "$(cat "$SCRIPT_DIR/task.md")"
) >"$OUTPUT" 2>"$ERR_LOG"
DSH_EXIT=$?
set -e

if [ "$DSH_EXIT" -ne 0 ]; then
  echo "dsh failed (exit $DSH_EXIT); stderr follows:"
  cat "$ERR_LOG"
  exit "$DSH_EXIT"
fi

cp "$OUTPUT" "$SCRIPT_DIR/last-output.txt"
echo "== grading the final assistant text (saved to last-output.txt)"
python3 "$SCRIPT_DIR/grader.py" "$OUTPUT"
VERDICT=$?
echo "grader exit code: $VERDICT"
exit "$VERDICT"
