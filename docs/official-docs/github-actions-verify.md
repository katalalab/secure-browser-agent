# Official Docs Evidence: GitHub Actions Verify

Retrieved: 2026-06-01

## Sources

- GitHub Docs, Workflow syntax for GitHub Actions: https://docs.github.com/actions/reference/workflows-and-actions/workflow-syntax
- GitHub Docs, Concurrency: https://docs.github.com/en/actions/concepts/workflows-and-actions/concurrency
- GitHub Docs, About status checks: https://docs.github.com/articles/about-status-checks
- GitHub Docs, About protected branches: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches
- GitHub `actions/checkout` release notes: https://github.com/actions/checkout/releases
- GitHub `actions/setup-node` release notes: https://github.com/actions/setup-node/releases

## Local Context

- Repository: `Nicolas0315/secure-browser-agent`
- Local branch before change: `main...origin/main`, clean
- Existing GitHub checks before change: no checks reported on PR #6
- Package engine: Node `>=22`
- Local CI verifier: `npm run verify:ci`
- Full local verifier with browser-backed CDP tests: `npm run verify`

## Decision

Add `.github/workflows/verify.yml` under the official workflow directory. Trigger it on `pull_request` to `main`, `push` to `main`, and `workflow_dispatch`. Keep `GITHUB_TOKEN` read-only with `contents: read`. Use concurrency to cancel stale runs for the same branch or PR. Use one uniquely named job, `verify`, so branch protection can target that status check without ambiguity.

The workflow runs `npm run verify:ci`, not the full local `npm run verify`, because GitHub-hosted runners do not have the operator's personal Chrome profiles, local Chrome-for-Testing cache, or ignored `runs/` target-pack state. Browser-backed CDP tests and `compact-command-audit --source all` remain in the local verifier. The CI audit uses `compact-command-audit --source run-gate-audit`, which is clean-checkout safe.

Use `actions/checkout@v5` and `actions/setup-node@v5` to avoid the GitHub Actions Node.js 20 deprecation warning seen on the first successful `main` run. Both v5 actions use the Node 24 action runtime.

## Verification

Local syntax and behavior checks:

```bash
node --check src/cli.mjs
npm run verify:ci
npm run verify
```

GitHub-side checks after merge:

```bash
gh run list --workflow Verify --limit 5
gh run view --log <run-id>
```

## Risk And Rollback

Risk: GitHub-hosted Ubuntu does not have local browser/profile state. The workflow intentionally runs only offline and compact smoke checks that must not require personal auth, Chrome profiles, cookies, or 1Password secrets.

Rollback:

```bash
git revert <merge-commit>
```

Next refresh: 2026-07-01 or when changing CI triggers, branch protection, or GitHub Actions permissions.
