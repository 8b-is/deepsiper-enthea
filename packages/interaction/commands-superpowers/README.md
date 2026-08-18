# dsh-commands-superpowers

Core superpowers slash commands, adapted from the workspace's superpowers
skill set into the harness's `ctx.commands` seam. Three commands:

- `/brainstorm <idea>` — Socratic idea exploration: a subagent surfaces
  assumptions, trade-offs, and edge cases, then ends with the clarifying
  questions that matter most and a refined statement of the idea.
- `/sdd <task>` — **subagent-driven development, the default flow for complex
  work.** A planner subagent produces a concrete plan, an implementer executes
  it in the session workspace, and a reviewer verifies the diff — the result
  returns all three phases.
- `/worktree create <branch> | list | remove <branch>` — native git worktree
  usage: `create` starts an isolated task lane under
  `<repoRoot>/.dsh-worktrees/<branch>`, `list` shows lanes, `remove` tears one
  down.

## Model Experience

`/sdd` is the recommended entry point for complex, multi-step tasks: it
splits planning, implementation, and review into separate focused subagent
runs instead of doing them in one turn, and reports the plan, the
implementation report, and the review verdict together. `/brainstorm` is for
the pre-planning exploration phase. `/worktree` gives every task an isolated
git worktree so parallel lanes never collide on the working tree.

## Configuration

| Key | Default | Meaning |
|-----|---------|---------|
| `provider` | `spawn` | Subagent provider backing the brainstorm/sdd phases |
| `maxDepth` | — | Opt-in delegation-depth cap; only passed to `subagents.start` when set (a provider without `depthLimit` stays usable) |
| `worktreeRoot` | `<repoRoot>/.dsh-worktrees` | Parent directory for worktrees |

## Requirements

- `brainstorm`/`sdd` need `ctx.subagents` with a mounted provider; they fail
  loud otherwise.
- `worktree` needs `ctx.shell` and a real git repository at the session cwd;
  both are resolved lazily and fail loud when absent.

## Known Limitations and Deferred Work

- `/sdd` runs the three phases sequentially in one command invocation; there
  is no interactive "re-plan after review" loop yet — the reviewer verdict is
  reported, and a follow-up `/sdd` is the manual continuation path.
- `create` always uses `-b <branch>`; creating on an existing branch is not
  yet supported.
- Bilingual README sync is deferred to the repository doc-sync pass.
