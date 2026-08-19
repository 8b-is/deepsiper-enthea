#!/usr/bin/env python3
"""Canonical Python syntax validator for the eval-entheai benchmark sweep.

`is_pure_syntax` reports whether a code string parses without a SyntaxError.
It is the single source of truth for the `ast_invariant` benchmark task; the
benchmark sweep imports this module and asserts the model-facing answer's
behavior against it before grading.
"""

import ast


def is_pure_syntax(code: str) -> bool:
    """Return True if code is syntactically valid Python, False otherwise."""
    try:
        ast.parse(code)
    except SyntaxError:
        return False
    return True
