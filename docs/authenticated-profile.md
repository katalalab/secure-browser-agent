## Authenticated Profile Flow

1. Run `scaffold-target` with exact `--origin` values for the target service.
2. Run `login` with a dedicated profile name.
3. Finish login manually in the opened browser.
4. Reuse that profile with `snapshot` or `extract`.
5. Delete `profiles/<target>` when the target project ends or within 30 days of last use.

`scaffold-target` writes a target pack under `runs/target-packs/<name>/` with `policy.json`, `recipes/diagnose.json`, `recipes/observe.json`, `recipes/inspect.json`, `recipes/analyze.json`, `recipes/operate.json`, `recipes/screenshot.json`, `recipes/crawl.json`, `recipes/outline.json`, `recipes/scrape-links.json`, `recipes/search.json`, and a command README. It does not write credentials; login still happens only in the dedicated browser profile.

Use `target-login <pack>` to open the dedicated headed Chrome profile at the pack login URL. It reads `target.json` and `policy.json`, never accepts passwords, and leaves credentials only in the target profile. Its JSON output includes a `handoff` with the post-login `target-proof-capture <pack> --real-external --run --wait-auth --wait-auth-status-out wait-auth-status.json --format markdown` command when `--real-external` is supplied. Prefer `target-login-capture` for real external proof runs because it opens the browser and runs the waiting capture lane in one command.

Use `target-login-capture <pack> --real-external --wait-auth-status-out wait-auth-status.json --completion-audit --format markdown` when you want one command to open the login browser and then wait for login completion before automatically writing the target proof artifacts and final objective gate summary.

Use `target-status <pack>` before headless runs to confirm whether the dedicated profile has local state or cookie DB artifacts. It reports `likelyAuthenticated` from file metadata only, so a site can still require a fresh interactive login even when the profile has cookies.

Use `target-auth-check <pack> --write` after login and after starting the pack daemon to prove the pack page URL no longer looks like a login screen. Real external proof requires this stronger page-level check in addition to local profile metadata.

Use `target-permissions <pack> status|plan|set|apply` to persist and apply explicit Chrome site permissions to only the pack's dedicated profile. Supported permission names are `clipboard`, `downloads`, `notifications`, `geolocation`, `camera`, `microphone`, `popups`, and `sensors`. Origins must already be allowed by the pack policy; `apply` refuses to write while the pack daemon is running unless `--force` is supplied.

Use `target-daemon <pack> start|status|stop` to keep the pack's dedicated Chrome/CDP profile running in the background. `start` opens the pack page URL by default, and `target-run --daemon` or `target-scrape --daemon` reuses it.

Use `target-autostart <pack> plan|write|install|load|unload|status|remove` to generate and manage a macOS LaunchAgent for the pack's background daemon. `write` stores the plist under the target pack for review, `install` writes to `~/Library/LaunchAgents/`, `load` writes the install plist and runs `launchctl bootstrap gui/<uid> <plist>`, `status` runs `launchctl print gui/<uid>/<label>`, and `unload` runs `launchctl bootout gui/<uid>/<label>`. Activation is never done by `verify.sh`; run `load` only for a target you intend to keep running.

Use `target-add-url <pack> <url...>` to append allowed URLs to `recipes/crawl.json` without hand-editing JSON. It validates target policy origins and deduplicates normalized URLs.

After a pack exists, use `target-run <pack> diagnose|observe|inspect|analyze|operate|screenshot|crawl|crawl-links|outline|links|search`. It resolves the pack policy, profile, recipe, output path, CSV defaults, artifact paths, and manifest automatically. `analyze` is the target-pack page-structure alias for the same scraping-candidate inspection flow and writes `outputs/analyze.json`; `operate` writes `outputs/operate.json` with a pre-mutation observation and operation candidates before you add explicit fill/click steps or use the generated selector templates.

Use `target-run-status <pack> <recipe> --format compact` to read saved `outputs/*.json|csv` without returning page text or row data. It reports freshness, parse status, step types, result keys, row counts, and refresh/status commands, so another agent can decide whether to rerun `operate`, `analyze`, `search`, or `scrape` without loading the full artifact.

Use `target-operate-add <pack> fill|click|wait-for|wait|observe|inspect|extract` to append guarded steps to `recipes/operate.json` without hand-editing JSON. It validates any step URL against the target policy, redacts inline fill values from command output, and refuses likely password/token fields unless you use `--value-env ENV_NAME`. Then run `target-run <pack> operate --daemon` against the dedicated target profile.

Use `target-scrape <pack>` after login to analyze the pack page URL and write `outputs/scrape.csv` with the best suggested extractor. It accepts the same `--selector`, `--suggestion`, `--fields`, and `--daemon` options as `scrape-cdp`.

Use `target-doctor <pack>` before login or scheduled scraping. It checks policy origins, login URL, recipes, and search provider origins.

Use `target-audit <pack>` before authenticated or scheduled automation. It combines `target-doctor`, read-only profile metadata, permission status, daemon/autostart state, and a config-file secret scan that excludes browser profiles and outputs. It fails on unsafe policy scope, authenticated non-Chrome engines, normal Chrome profile use, or secret-like values in pack configuration.

For a real external target, save benchmark JSON before writing proof:

```bash
node src/cli.mjs target-proof-plan runs/target-packs/target-service --real-external --format markdown
node src/cli.mjs target-proof-plan runs/target-packs/target-service --real-external --strict --format json
node src/cli.mjs target-login-capture runs/target-packs/target-service --real-external --wait-auth-status-out wait-auth-status.json --completion-audit --format markdown
node src/cli.mjs target-auth-check runs/target-packs/target-service --write --status-out auth-check-status.json --daemon --strict --format compact
node src/cli.mjs target-auth-watch runs/target-packs/target-service --status-out auth-watch-status.json --timeout-ms 300000 --interval-ms 5000 --format compact
node src/cli.mjs target-proof-capture runs/target-packs/target-service --real-external --run --wait-auth --wait-auth-status-out wait-auth-status.json --completion-audit --format markdown
node src/cli.mjs target-benchmark runs/target-packs/target-service --write --out proof/target-benchmark.json --format json
node src/cli.mjs target-proof runs/target-packs/target-service --real-external --write --auth-check-file runs/target-packs/target-service/proof/auth-check.json --benchmark-file runs/target-packs/target-service/proof/target-benchmark.json
node src/cli.mjs readiness-audit --format markdown
```
