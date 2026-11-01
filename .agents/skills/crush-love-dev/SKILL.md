---
name: crush-love-dev
description: Use the crush-love-dev launcher for the crush runtime. Diagnose wedged session databases, emit the QuantTern emotional ternary code, run the DO loop, and arm the enthea door or peer mesh. Trigger on "crush-love-dev", "crush doctor", "quanttern", "DO loop", "enthea door", or "peer mesh".
---

# crush-love-dev

`crush-love-dev` is the e2e launcher for the crush runtime ([8b-is/crush-love-dev](https://github.com/8b-is/crush-love-dev)). It passes unknown arguments through to `crush`, so treat it as a wrapper: use its flags for the runtime lanes and the plain `crush` arguments for everything else.

## Prerequisites

The launcher links itself onto `PATH` from its checkout:

```sh
ln -sf "$PWD/bin/crush-love-dev" /opt/homebrew/bin/crush-love-dev
chmod +x bin/crush-love-dev
```

If `crush-love-dev` is not on `PATH`, point at `bin/crush-love-dev` in the checkout instead of guessing a location.

## Lanes

| command | effect |
|---|---|
| `crush-love-dev` | launch `crush` in dev mode |
| `crush-love-dev --apply` | apply the ultralovegod theme for this session; the config is backed up and restored on exit |
| `crush-love-dev --ultra` | ultra-performance session options + theme |
| `crush-love-dev --instinct` | `--ultra` plus the full 全 session |
| `crush-love-dev --banner` | print the banner only |
| `crush-love-dev --doctor` | scan local crush session databases for wedges |
| `crush-love-dev --loop` | run the DO loop: reflect, improve, wire, polish, push, readme |
| `crush-love-dev --quanttern` | emit the emotional ternary code (VAD to `{-1, 0, +1}`) |
| `crush-love-dev --lsp` | arm the vaked-lsp gateway for UE C++, Rust, Go, Luau, and Bash |
| `crush-love-dev --enthea` | arm the enthea door: MCP servers and personas into the session |
| `crush-love-dev --mesh` | peer mesh across crush, jcode, opencode, and agy |
| `crush-love-dev --lan` | LAN remote access on `:4095`, `:4096`, `:4097` |

`--doctor` is the safe first command when a session is stuck. It reports two wedges worth naming: media-interleave (an assistant batch with several tool calls where an earlier result carries an image, which the wire layer splits across a synthetic user message) and interrupted-tools (a tool call whose result never landed). Fixed in crush stream 0.94.1 and 0.97.x; the doctor warns when the running version predates the fix.

## QuantTern

`--quanttern` prints the VAD emotional code: each of valence, arousal, and dominance quantizes to `{-1, 0, +1}` and packs four trits per byte. The law is the lane's: a zero is a real "don't know", not a rounding error. Use it when the task is emotional-state classification, not weight quantization; weight quantization belongs to the `ctx.quant` seam.

## Boundaries

The launcher owns its themes, session databases, and mesh state. Do not copy its theme files or write into its databases; run its commands and report their output. `--loop` pushes changes, so confirm the user wants that lane before running it.
