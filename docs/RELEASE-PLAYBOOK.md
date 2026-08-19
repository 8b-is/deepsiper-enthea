# Release Playbook — deepsiper-enthea

The operator's standing directive: **periodically run a full E2E cycle**
(brainstorm → design → spec → subagent-driven development) and then a release.
"Release" here means the full pipeline: commit → bump → push → tag → GitHub
release → constellation sync → landing/README update. This playbook is the
operator-approved sequence (2026-08-19).

## The release sequence

1. **Land the feature work.** Feature commit(s) must be green before the bump:
   package tests, `tsc -b tsconfig.host.json`, `pnpm lint`,
   `verify-package-invariants`, `verify-cordis-config`, and the headless core
   boot when core bundles changed.
2. **Bump the version.**
   ```sh
   pnpm release:dsh patch   # or minor / major; bumps the whole dsh family
   ```
   This commits `release(dsh): <X.Y.Z>` (all manifests + lockfile).
3. **Push.**
   ```sh
   git push origin master
   ```
4. **Tag.** The bump prints the tag command; use it:
   ```sh
   git tag dsh-v<X.Y.Z> && git push origin dsh-v<X.Y.Z>
   ```
   Tag name is always `dsh-v<X.Y.Z>` (e.g. `dsh-v0.3.3`).
5. **GitHub release.**
   ```sh
   gh release create dsh-v<X.Y.Z> --repo 8b-is/deepsiper-enthea \
     --title "dsh v<X.Y.Z> — <summary>" --notes "$(cat <<'EOF'
   ## Highlights
   ...
   ## Verification
   ...
   EOF
   )"
   ```
6. **Constellation sync.** Verify the root README's "Sovereign Constellation"
   backreferences are intact; if the cycle produced publishable content, post
   to pocoo.vaked.dev (`posts/YYYY-MM-DD-slug.md`, `npm run build`, commit,
   push; Cloudflare rebuilds ~30s, verify `/posts/<slug>` returns 200).
7. **Landing/README update.** The root README is the landing: update feature
   bullets, benchmark numbers, and any version-visible claims in the same
   cycle as the code.

## Gotchas (all hit live)

- **Rebase drops an already-upstream bump.** If `origin/master` already has
  `release(dsh): <version>` (e.g. a sibling checkout pushed it), the bump
  commit is dropped on rebase ("patch contents already upstream"). Check
  `git log origin/master -3` before bumping; if the version is already
  upstream, push the feature commit and bump the *next* patch.
- **The pre-push/commit hooks run gates** (lint, whitespace, translation
  pairing, third-party notices, vendor manifest guard). Fix staged violations
  before the commit; a `🥊` gate means the commit was rejected.
- **Translation pairing is enforced on commit.** New/changed bilingual READMEs
  need matching en/zh switchers (`English | [中文](README.zh.md)` on the en
  side, `[English](README.md) | 中文` on the zh side) and a
  `pnpm run verify-translation-pairing --write <README>` record.
- **Secrets are never committed** (HF tokens, Slack creds, Modal tokens stay
  in their secret stores).

## E2E cycle convention

Spec → `.agents/plans/YYYY-MM-DD-<slug>.md`; implement (subagent-driven where
it fits); verify against the repo gates; **every non-trivial change ships an
Agent Note** (`.agents/notes/implemented/feature/`) in the same PR.
