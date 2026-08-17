#!/usr/bin/env python3
"""Pure-stdlib grader for the eval-entheai fizzbuzz task.

Reads the agent's final output from stdin (or a file argument), extracts the
`def fizzbuzz(n)` function, runs it against fixed cases, prints one verdict
line, and exits 0 on pass / 1 on fail. No third-party dependencies.

Usage:
    python3 grader.py < output.txt
    python3 grader.py output.txt
"""

import re
import sys

# Deterministic case set, promised to the model in task.md.
CASES = list(range(1, 16)) + [30, 45, 100]


def expected(n: int) -> str:
    if n % 15 == 0:
        return "FizzBuzz"
    if n % 3 == 0:
        return "Fizz"
    if n % 5 == 0:
        return "Buzz"
    return str(n)


def extract_function(source: str) -> str:
    """Return the `def fizzbuzz(...)` line plus its indented body.

    Stops at the first non-blank unindented line, so prose above, prose
    below, and code fences around the answer are all ignored.
    """
    lines = source.splitlines()
    start = None
    for index, line in enumerate(lines):
        if re.match(r"^\s*def\s+fizzbuzz\s*\(", line):
            start = index
            break
    if start is None:
        raise ValueError("no `def fizzbuzz(...)` found in the output")
    body = [lines[start]]
    for line in lines[start + 1:]:
        if line.strip() == "" or line[:1] in (" ", "\t"):
            body.append(line)
        else:
            break
    return "\n".join(body)


def main() -> int:
    if len(sys.argv) > 2:
        print("usage: grader.py [output-file] (reads stdin when omitted)")
        return 2
    if len(sys.argv) == 2:
        with open(sys.argv[1], encoding="utf-8") as handle:
            output = handle.read()
    else:
        output = sys.stdin.read()

    try:
        source = extract_function(output)
    except ValueError as error:
        print(f"FAIL: {error}")
        return 1

    namespace: dict = {}
    try:
        exec(source, namespace)
        fizzbuzz = namespace["fizzbuzz"]
    except Exception as error:
        print(f"FAIL: could not load fizzbuzz from the output: {type(error).__name__}: {error}")
        return 1

    for n in CASES:
        try:
            actual = fizzbuzz(n)
        except Exception as error:
            print(f"FAIL: fizzbuzz({n}) raised {type(error).__name__}: {error}")
            return 1
        want = expected(n)
        if actual != want:
            print(f"FAIL: fizzbuzz({n}) = {actual!r}, expected {want!r}")
            return 1

    shown = ", ".join(str(n) for n in CASES)
    print(f"PASS: fizzbuzz matches expectations for {len(CASES)} cases ({shown})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
