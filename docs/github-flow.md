# GitHub Flow

This repository uses short-lived branches, pull requests, and the `Verify` GitHub Actions workflow as the merge gate.

## Required Local Checks

Run these before opening or updating a PR:

```bash
npm run verify:ci
npm test
npm run probe:compact-command-audit-all
npm run probe:mcp-compact
node src/cli.mjs doctor --offline
```

Use `npm run verify:ci` for the same non-secret, no-personal-profile gate that runs on GitHub Actions. Use `npm run verify` when local runtime conditions match the repo default and browser-backed CDP tests are expected to run.

`verify:ci` intentionally uses `probe:compact-command-audit-ci`, not `--source all`, because clean GitHub-hosted runners do not have local `runs/` target-pack state. The broader `probe:compact-command-audit-all` gate remains part of the full local `npm run verify`.

## Pull Request Rules

- Branch from `main`.
- Keep PRs scoped to one issue or one closely related slice.
- Put verification commands and results in the PR body.
- Do not include `runs/`, profiles, logs, browser storage, cookies, or secrets.
- Do not merge a PR with failing `Verify / verify` checks.
- If a PR touches auth, runtime mutation, branch protection, or merge policy, run an independent local review before merge.

## Conflict And Error Handling

- Rebase or merge `origin/main` into the branch before final review when GitHub reports conflicts.
- If CI fails, fix `npm run verify:ci` locally first, then push a new commit.
- If GitHub reports no checks, confirm `.github/workflows/verify.yml` is present on the target branch and rerun the workflow.
- Keep issue comments factual: landed work, verification, remaining closure criteria.

## Branch Protection Target

After the `Verify / verify` check has completed successfully on `main`, protect `main` with:

- Require a pull request before merging.
- Require status checks to pass before merging.
- Require branches to be up to date before merging.
- Required check: `verify`.
- Require linear history when available.
- Do not allow force pushes.
- Do not allow deletions.

GitHub only lets required checks be selected after a matching status check has completed recently.
