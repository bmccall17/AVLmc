# Codex instructions for this repo

This repo lives in WSL and should be edited, tested, and inspected using WSL-native tools only.

Default to:
- working directory paths under `/home/brett/...`
- Linux shell commands
- WSL-native `node`, `npm`, `python3`, `git`, and related tooling

Do not use Windows-native tools, PowerShell, `.exe` binaries, or paths under `/mnt/c` for this repo unless explicitly asked or as a last resort after WSL-native tools fail.

Before making code changes, if environment/tooling is uncertain, verify with:

```sh
pwd
uname -a
which node
which npm
which python3
which git
```

## Architecture reference (read this first)

The authoritative map of how this product is wired lives in the **System Registry**,
`lib/system-registry.ts` (a typed graph of surfaces, services, tables, integrations, jobs, and
sources, with each node's source-of-truth file/table). Two generated views derive from it and
cannot drift:

- `docs/product/system-map.generated.md` — human/agent-readable architecture doc. Start here to
  understand how an event flows from AVLgo → `lib/events.ts` → the `events` table → a ranked
  homepage card, and where each piece's source of truth lives.
- `GET /api/admin/system-map` — the same model as JSON (admin-gated).

When you add or rename a backing file or table, update its node's `sourceOfTruth` and run
`npm run generate:system-map`; `npm run test:registry` guards against drift.