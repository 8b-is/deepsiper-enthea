#!/usr/bin/env bash
# Performance environment for dsh — mimalloc + V8 memory flags
# Source this before running dsh: source scripts/perf-env.sh
#
# What it does:
#   1. Uses mimalloc if available (reduces fragmentation, faster allocs)
#   2. Caps V8 heap to prevent runaway allocation
#   3. Enables optimize-for-size for lower RSS
#   4. Tunes GC for shorter pauses + less memory

# ── mimalloc ──────────────────────────────────────────────────────────────────
# Prefer Homebrew path, fall back to ldconfig
MIMALLOC_PATH=""
for candidate in \
  /opt/homebrew/lib/libmimalloc.dylib \
  /usr/local/lib/libmimalloc.dylib \
  /usr/lib/libmimalloc.so \
  /usr/lib/x86_64-linux-gnu/libmimalloc.so \
  /usr/lib/aarch64-linux-gnu/libmimalloc.so; do
  if [ -f "$candidate" ]; then
    MIMALLOC_PATH="$candidate"
    break
  fi
done

if [ -n "$MIMALLOC_PATH" ]; then
  # --malloc-lib cannot be set via NODE_OPTIONS; use DYLD_INSERT_LIBRARIES (macOS)
  # or LD_PRELOAD (Linux) to load mimalloc into every Node process
  case "$(uname -s)" in
    Darwin*) export DYLD_INSERT_LIBRARIES="$MIMALLOC_PATH" ;;
    *)       export LD_PRELOAD="${LD_PRELOAD:+$LD_PRELOAD:}$MIMALLOC_PATH" ;;
  esac
  # Also export for any subprocess that spawns node with --malloc-lib
  export MIMALLOC_LIB="$MIMALLOC_PATH"
  echo "[perf] mimalloc: $MIMALLOC_PATH" >&2
else
  echo "[perf] mimalloc not found — using system allocator" >&2
fi

# ── V8 heap / GC tuning ──────────────────────────────────────────────────────
# --max-old-space-size and --max-semi-space-size are allowed in NODE_OPTIONS.
# The rest (--initial-heap-size, --optimize-for-size, --gc-interval, etc.)
# are restricted and must be passed directly on the command line.
# We put the allowed ones in NODE_OPTIONS and create a wrapper for the rest.
V8_NODE_OPTIONS=(
  --max-old-space-size=512
  --max-semi-space-size=16
)

V8_DIRECT_FLAGS=(
  --initial-heap-size=64
  --optimize-for-size
  --gc-interval=100
  --random-gc-interval=100
  --zero-unused-memory
)

for flag in "${V8_NODE_OPTIONS[@]}"; do
  export NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }$flag"
done

echo "[perf] NODE_OPTIONS: ${V8_NODE_OPTIONS[*]}" >&2
echo "[perf] Direct V8 flags: ${V8_DIRECT_FLAGS[*]}" >&2

# ── dsh wrapper ───────────────────────────────────────────────────────────────
# dsh-perf runs dsh with all perf flags (mimalloc + V8 direct flags).
# Usage: dsh-perf --profile headless "task"
#        dsh-perf --version
dsh-perf() {
  local node_cmd="node"
  [ -n "$MIMALLOC_LIB" ] && node_cmd="node --malloc-lib=$MIMALLOC_LIB"
  exec $node_cmd "${V8_DIRECT_FLAGS[@]}" apps/cli/src/bin.ts "$@"
}
export -f dsh-perf 2>/dev/null || true
