# slice-flow commands

A set of Claude Code slash commands and skills for a "slice-flow" workflow: turn a
PRD into a slice → task → scenario plan, build each task with TDD, and ship the
result as a stack of small PRs.

Sensitive values (internal Slack IDs, workspace names, a preview domain, a Linear
team prefix) have been replaced with generic examples, each introduced by "e.g.,".

## Layout

Drop these into your `~/.claude` directory, matching the tree here:

```
commands/            # the /slice-* slash commands
skills/              # slice-plan-format, slice-build-engine
prompts/             # authoring checklist + review checklist script
```

## The pipeline

1. `/slice-plan`   turn a PRD into a plan, then auto-split into tasks
2. `/slice-replan` re-split after hand-editing scenarios
3. `/slice-build`  build a plan task by task (TDD per scenario)
4. `/slice-pr`     ship the next stack part as one open PR at a time

Supporting: `/slice-split`, `/slice-status`, `/slice-prd-audit`,
`/slice-autoship-stack` (delivers a whole stack unattended), and the deprecated
`/slice-stack`.

## External dependencies (NOT included)

This bundle is the slice surface only. The commands reference other pieces that
are not in this zip, so the workflow will not run end to end without them. What is
missing, and where each is used:

- `grill-with-docs` skill, from Matt Pocock's `mattpocock-skills` plugin. Drives
  the `/slice-plan` interview.
- `tommymorgan:jj` skill. Version control operations used across most commands.
- `tdd-execution` and `test-quality` skills. Used by `slice-build-engine`.
- `tommymorgan:root-cause-analyzer` agent. Used by `slice-build-engine` when a
  test fails.
- `/tommy-review`, `/demo-record`, `/pr-followup`, `/pr-split` commands. Called by
  the build and PR steps.

You can read and adapt every slice command as is. To run them unmodified, install
the plugins above (or stub out the calls). The `tommymorgan:*` skills and the
`tommy-*` / `pr-*` commands are personal and are not published, so treat those
references as points to replace with your own equivalents.

## Version control

These commands assume [jj (Jujutsu)](https://github.com/jj-vcs/jj), not raw git,
and expect a jj repo (git-colocated is fine).
