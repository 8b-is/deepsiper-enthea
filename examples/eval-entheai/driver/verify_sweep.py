#!/usr/bin/env python3
"""verify_sweep.py — Keyless regression gate for the eval-entheai benchmark sweep.

Imports benchmark_sweep as a module (safe: its main only runs under
`if __name__ == "__main__":`), extracts and executes each reference answer,
grades it with the sweep's own test lambdas, and asserts the canonical
is_pure_syntax validator agrees with the ast_invariant benchmark answer.

Stdlib only — no pytest, no third-party imports — so it runs via
`uv run --script` with no dependencies or credentials.
"""

import sys

import benchmark_sweep as sweep
from is_pure_syntax import is_pure_syntax


def main() -> int:
    try:
        assert is_pure_syntax("x = 1 + 2") is True, "canonical is_pure_syntax rejected 'x = 1 + 2'"
        assert is_pure_syntax("x = ((") is False, "canonical is_pure_syntax accepted 'x = (('"

        for b in sweep.BENCHMARKS:
            fn = sweep.extract_and_exec(b["answer"], b["fn_name"])
            assert b["test"](fn), f"grade failed for benchmark {b['id']!r}"

        n = len(sweep.BENCHMARKS)
        print(f"verify_sweep: {n}/{n} reference answers extract and grade; canonical validator OK")
        return 0
    except AssertionError as e:
        print(f"verify_sweep: FAILED — {e}", file=sys.stderr)
        return 1
    except Exception as e:
        print(f"verify_sweep: ERROR — {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
