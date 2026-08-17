#!/usr/bin/env python3
"""Summarize a dsh-eval results ledger (JSONL rows: ts, attempt, verdict, output)."""
import json
import sys
from pathlib import Path


def main() -> int:
    ledger = Path(sys.argv[1] if len(sys.argv) > 1 else "results.jsonl")
    if not ledger.exists():
        print(f"no ledger at {ledger}")
        return 2
    rows = [json.loads(l) for l in ledger.read_text().splitlines() if l.strip()]
    if not rows:
        print("empty ledger")
        return 2
    verdicts = [r["verdict"] for r in rows]
    passes = verdicts.count("PASS")
    print(f"attempts: {len(rows)}  pass: {passes}  fail: {verdicts.count('FAIL')}  error: {verdicts.count('ERROR')}")
    print(f"pass rate: {passes}/{len(rows)} ({100.0 * passes / len(rows):.0f}%)")
    for r in rows:
        print(f"  #{r['attempt']:<3} {r['verdict']:<5} {r['output']}")
    return 0 if passes == len(rows) else 1


if __name__ == "__main__":
    sys.exit(main())
