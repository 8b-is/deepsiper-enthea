# Deepsiper Enthea Benchmarking Suite

Deepsiper Enthea includes an automated multi-case AST and mathematical logic evaluation sweep running against the built `dsh` runtime.

## Running the Multi-Case Sweep

```sh
# Ensure packages are built
pnpm build:lib

# Run the benchmark sweep across all 5 verification categories
python3 examples/eval-entheai/driver/benchmark_sweep.py
```

## Empirical Baseline Results

| Benchmark Task | Target Component | Trials | Pass Rate |
|---|---|---|---|
| **FizzBuzz Logic & 18 Edge Cases** | Logic Execution | 2 / 2 | **100.0%** |
| **$O(\log N)$ Matrix Power Fibonacci** | Math & Exponentiation | 2 / 2 | **100.0%** |
| **Kademlia 256-bit XOR Metric Distance** | Distributed DHT Routing | 2 / 2 | **100.0%** |
| **BitLinear $\{-1, 0, +1\}$ Quantizer** | Ternary Weight Mapping | 2 / 2 | **100.0%** |
| **AST Invariant & Pure Syntax Validator** | Syntax Tree Verification | 2 / 2 | **100.0%** |

JSON metrics are saved automatically to `examples/eval-entheai/driver/benchmark_report.json`.
