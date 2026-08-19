# Deepsiper Enthea Benchmarking Suite

Deepsiper Enthea includes an automated multi-case AST and mathematical logic evaluation sweep running against the built `dsh` runtime.

## Running the Multi-Case Sweep

```sh
# Keyless fast gate (no dsh runtime): pure-Python grading logic + canonical validator
pnpm bench:entheai:verify

# Full sweep against the built dsh runtime (inline stub backend)
pnpm bench:entheai
```

## Empirical Baseline Results

| Benchmark Task | Target Component | Trials | Pass Rate |
|---|---|---|---|
| **FizzBuzz Logic & 18 Edge Cases** | Logic Execution | 2 / 2 | **100.0%** |
| **$O(\log N)$ Matrix Power Fibonacci** | Math & Exponentiation | 2 / 2 | **100.0%** |
| **Kademlia 256-bit XOR Metric Distance** | Distributed DHT Routing | 2 / 2 | **100.0%** |
| **BitLinear $\{-1, 0, +1\}$ Quantizer** | Ternary Weight Mapping | 2 / 2 | **100.0%** |
| **AST Invariant & Pure Syntax Validator** | Syntax Tree Verification | 2 / 2 | **100.0%** |

`pnpm bench:entheai:verify` is the keyless regression gate for the sweep's grading logic; `pnpm bench:entheai` runs the full sweep.

JSON metrics are saved automatically to `examples/eval-entheai/driver/benchmark_report.json`.
