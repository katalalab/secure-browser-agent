## Commands

```bash
npm run doctor
node src/cli.mjs mcp-stdio
node src/cli.mjs agent-next --format compact
node src/cli.mjs agent-preflight --real-external --format compact
node src/cli.mjs agent-proof-checklist --format compact
node src/cli.mjs agent-proof-checklist --write --out operator/agent-proof-checklist-latest.json --format compact
node src/cli.mjs agent-proof-checklist-status --format compact
node src/cli.mjs agent-proof-closeout --include-compact-command-audit --format compact
node src/cli.mjs agent-proof-closeout --include-compact-command-audit --write --out operator/agent-proof-closeout-latest.json --format compact
node src/cli.mjs agent-proof-closeout-status --format compact
node src/cli.mjs agent-next --monitor-timeout-ms 10000 --monitor-interval-ms 1000 --format compact
node src/cli.mjs control-status --format compact
node src/cli.mjs control-status --monitor-timeout-ms 10000 --monitor-interval-ms 1000 --format compact
node src/cli.mjs control-status --format markdown
node src/cli.mjs agent-loop-step --format compact
node src/cli.mjs agent-workflow --task existing-tab --intent inspect --match-origin https://github.com --match-path /notifications --mcp-observation-in operator/chrome-mcp-observation-latest.json --chrome-extension-prepared yes --chrome-extension-backend-available yes --format compact
node src/cli.mjs agent-loop-step --write --out operator/agent-loop-step-latest.json --format compact
node src/cli.mjs agent-loop-step-status --in operator/agent-loop-step-latest.json --format compact
node src/cli.mjs agent-loop-step-status --in operator/agent-loop-step-latest.json --monitor-timeout-ms 10000 --monitor-interval-ms 1000 --format compact
node src/cli.mjs agent-loop-step --run --write --out operator/agent-loop-step-latest.json --timeout-ms 300000 --format compact
node src/cli.mjs agent-loop-step --run --write --out operator/agent-loop-step-latest.json --timeout-ms 15000 --monitor-timeout-ms 10000 --monitor-interval-ms 1000 --format compact
node src/cli.mjs agent-proof-step --format compact
node src/cli.mjs agent-proof-step --run --operator-ok OK --write --out operator/agent-proof-step-latest.json --monitor-timeout-ms 10000 --monitor-interval-ms 1000 --format compact
node src/cli.mjs agent-proof-step-start --format compact
node src/cli.mjs agent-proof-step-start --run --operator-ok OK --out operator/agent-proof-step-latest.json --timeout-ms 300000 --monitor-timeout-ms 10000 --monitor-interval-ms 1000 --format compact
node src/cli.mjs agent-proof-step-status --in operator/agent-proof-step-latest.json --format compact
node src/cli.mjs chrome-control-plan --format compact
node src/cli.mjs chrome-mcp-observation --status-text 'Chrome DevTools MCP Status\n\nConnected: yes\nTools: 29' --list-pages-text 'Pages:\n- 0: Example https://example.com/' --source peekaboo.browser.status+list_pages --write --format compact
node src/cli.mjs chrome-mcp-observation --observed-connected yes --observed-tools 29 --observed-page-list-ok no --observed-list-pages-timed-out yes --observed-last-error 'Network.enable timed out' --source peekaboo.browser.status+list_pages-normalized --write --format compact
node src/cli.mjs chrome-mcp-observation-status --format compact
node src/cli.mjs chrome-mcp-status --format compact
node src/cli.mjs chrome-mcp-handoff --chrome-mcp-connected yes --chrome-mcp-tools 29 --chrome-mcp-page-list-ok yes --chrome-mcp-page-count 3 --chrome-mcp-source peekaboo.browser.status+list_pages --format compact
node src/cli.mjs chrome-mcp-timeout-plan --write --observed-connected yes --observed-tools 29 --observed-last-error 'Network.enable timed out' --observed-source peekaboo.browser.status+list_pages --format compact
node src/cli.mjs chrome-mcp-timeout-plan-status --format compact
node src/cli.mjs chrome-mcp-autostart-plan --format compact
node src/cli.mjs chrome-mcp-autostart-plan --write --out operator/chrome-mcp-autostart-plan-latest.json --format compact
node src/cli.mjs chrome-mcp-autostart-plan-status --format compact
node src/cli.mjs chrome-mcp-handoff --mcp-observation-in operator/chrome-mcp-observation-latest.json --format compact
node src/cli.mjs regular-chrome-use --intent inspect --mcp-observation-in operator/chrome-mcp-observation-latest.json --format compact
node src/cli.mjs regular-chrome-use --intent inspect --status-text 'Chrome DevTools MCP Status\n\nConnected: yes\nTools: 29' --list-pages-text 'Pages:\n- 0: Example https://example.com/' --source peekaboo.browser.status+list_pages --format compact
node src/cli.mjs agent-backend-select --task existing-tab --mcp-observation-in operator/chrome-mcp-observation-latest.json --format compact
node src/cli.mjs agent-control-plane --write --task existing-tab --mcp-observation-in operator/chrome-mcp-observation-latest.json --format compact
node src/cli.mjs agent-control-plane-status --format compact
node src/cli.mjs agent-control-plane-watch --run --format compact
node src/cli.mjs regular-chrome-refresh --intent inspect --format compact
node src/cli.mjs regular-chrome-status --mcp-observation-in operator/chrome-mcp-observation-latest.json --format compact
node src/cli.mjs regular-chrome-watch --run --mcp-observation-in operator/chrome-mcp-observation-latest.json --format compact
node src/cli.mjs chrome-apple-events-status --write --out operator/chrome-apple-events-status-latest.json --format compact
node src/cli.mjs chrome-apple-events-enable-plan --write --out operator/chrome-apple-events-enable-plan-latest.json --format compact
node src/cli.mjs chrome-apple-events-outline --write --out operator/chrome-apple-events-outline-latest.json --format compact
node src/cli.mjs browser-route --task authenticated-scrape --format compact
node src/cli.mjs browser-route --task existing-tab --chrome-mcp-connected yes --chrome-mcp-tools 29 --chrome-mcp-page-list-ok yes --chrome-mcp-page-count 3 --chrome-mcp-source peekaboo.browser.status+list_pages --format compact
node src/cli.mjs chrome-extension-status --format compact
node src/cli.mjs chrome-extension-handoff --format compact
node src/cli.mjs chrome-extension-resume --format compact
node src/cli.mjs chrome-extension-troubleshoot --backend-available no --backend-last-error 'Browser is not available: extension' --format compact
node src/cli.mjs chrome-extension-troubleshoot --backend-available no --backend-last-error 'Transport closed' --profile-window-retry-attempted yes --format compact
node src/cli.mjs chrome-extension-backend-check-plan --format compact
node src/cli.mjs chrome-extension-claim-plan --backend-ready yes --intent inspect --match-origin https://github.com --match-path /notifications --format compact
node src/cli.mjs providers --format markdown
node src/cli.mjs agent-browser-doctor --format compact
node src/cli.mjs provider-doctor-status --format compact
node src/cli.mjs backend-matrix --mcp-observation-in operator/chrome-mcp-observation-latest.json --format compact
node src/cli.mjs backend-matrix --write --out operator/backend-matrix-latest.json --mcp-observation-in operator/chrome-mcp-observation-latest.json --format compact
node src/cli.mjs backend-matrix-status --in operator/backend-matrix-latest.json --mcp-observation-in operator/chrome-mcp-observation-latest.json --format compact
node src/cli.mjs status-cache --key provider-doctor-status --write --format compact
node src/cli.mjs source-audit --format markdown
node src/cli.mjs github-repo-research --limit 8 --write --out research/github-repo-research-latest.json --format compact
node src/cli.mjs target-worker-pool --format compact
node src/cli.mjs lightpanda-doctor --format compact
node src/cli.mjs lightpanda-decision --decision reject --write --format markdown
node src/cli.mjs lightpanda-gate --format compact
node src/cli.mjs playwright-doctor --format compact
node src/cli.mjs selenium-doctor --format compact
node src/cli.mjs secret-audit --format markdown
node src/cli.mjs secret-audit --format compact
node src/cli.mjs secret-setup-plan --mode service-account --format markdown
node src/cli.mjs secret-setup-plan --mode connect --format compact
node src/cli.mjs secret-run-plan --mode service-account --command target-login-capture --target-dir runs/target-packs/github --format compact
node src/cli.mjs secret-run-select --command target-login-capture --target-dir runs/target-packs/github --format compact
node src/cli.mjs secret-env-handoff --format compact
node src/cli.mjs benchmark --quick --iterations 1 --format markdown
node src/cli.mjs benchmark --url https://example.com --iterations 1 --format markdown
node src/cli.mjs benchmark --url https://example.com --iterations 1 --write --out provider-benchmarks/lightpanda-public.json --format json
node src/cli.mjs target-benchmark runs/target-packs/example-public --recipes observe,inspect --iterations 1 --format markdown
node src/cli.mjs target-benchmark runs/target-packs/target-service --write --out proof/target-benchmark.json --format json
node src/cli.mjs runtime-audit --format markdown
node src/cli.mjs runtime-audit --format compact
node src/cli.mjs runtime-cleanup-plan --format markdown
node src/cli.mjs runtime-cleanup-plan --format compact
node src/cli.mjs run-gate-audit --format compact
node src/cli.mjs readiness-audit --format markdown
node src/cli.mjs readiness-audit --format compact
node src/cli.mjs objective-next --format compact
node src/cli.mjs operator-pack --write --chrome-mcp-status-file runs/operator/chrome-mcp-status.txt --chrome-mcp-list-pages-file runs/operator/chrome-mcp-list-pages.txt --chrome-extension-backend-available no --chrome-extension-backend-last-error 'Browser is not available: extension' --format compact
node src/cli.mjs operator-runbook --write --format markdown
node src/cli.mjs objective-status --write --format markdown
node src/cli.mjs objective-status --format compact
node src/cli.mjs proof-gate-status --format compact
node src/cli.mjs proof-gate-status --write --format compact
node src/cli.mjs proof-gate-watch --write --timeout-ms 300000 --interval-ms 5000 --format compact
node src/cli.mjs login-handoff-status --format compact
node src/cli.mjs background-monitor-plan --timeout-ms 300000 --interval-ms 5000 --format compact
node src/cli.mjs background-proof-capture-plan --timeout-ms 300000 --interval-ms 5000 --format compact
node src/cli.mjs background-proof-capture-status --format compact
node src/cli.mjs background-proof-capture-start --mode capture --format compact
node src/cli.mjs objective-resume --format markdown
node src/cli.mjs objective-resume --format compact
node src/cli.mjs objective-resume --write --format markdown
node src/cli.mjs objective-resume --run --operator-ok OK --format markdown
node src/cli.mjs objective-resume --run --operator-ok OK --operator-ready --write --format markdown
node src/cli.mjs profile-info --profile target-service
node src/cli.mjs profile-status --profile target-service
node src/cli.mjs cdp-start --profile target-service
node src/cli.mjs cdp-status --profile target-service
node src/cli.mjs cdp-stop --profile target-service
node src/cli.mjs login https://target.example/login --profile target-service
node src/cli.mjs open 'data:text/html,<h1>OK</h1><a href="/x">Link</a>'
node src/cli.mjs snapshot --json
node src/cli.mjs extract 'data:text/html,<a href="/x">Link</a>' --selector 'a' --fields text,href
node src/cli.mjs outline 'data:text/html,<h1>OK</h1><a href="/x">Link</a>'
node src/cli.mjs observe-cdp 'data:text/html,<main><h1>OK</h1><a href="/x">Link</a><input name="q"></main>' --profile cdp-observe
node src/cli.mjs analyze-cdp 'data:text/html,<main><h1>Catalog</h1><ul><li class="item">A</li><li class="item">B</li></ul></main>' --profile cdp-analyze
node src/cli.mjs scrape-cdp 'data:text/html,<main><h1>Catalog</h1><ul><li class="item">A</li><li class="item">B</li></ul></main>' --profile cdp-scrape --out catalog.csv --format csv
node src/cli.mjs observe-cdp 'data:text/html,<main><h1>OK</h1></main>' --profile cdp-observe --daemon
node src/cli.mjs inspect-cdp 'data:text/html,<main><ul><li class="item">A</li><li class="item">B</li></ul></main>' --profile cdp-inspect
node src/cli.mjs wait-cdp 'data:text/html,<script>setTimeout(()=>document.body.append("Ready"),50)</script>' --text Ready --profile cdp-wait
node src/cli.mjs console-cdp 'data:text/html,<script>console.log("hello");console.error("bad")</script>' --profile cdp-console
node src/cli.mjs screenshot-cdp 'data:text/html,<main><h1>Shot</h1></main>' --out shot.png --profile cdp-shot --manifest
node src/cli.mjs outline-cdp 'data:text/html,<h1>OK</h1><a href="/x">Link</a>' --profile cdp-probe
node src/cli.mjs fill-cdp 'data:text/html,<input name="q">' --selector 'input[name=q]' --value 'query'
node src/cli.mjs click-cdp 'data:text/html,<button id="go">Go</button>' --selector '#go'
node src/cli.mjs network-cdp https://example.com --profile cdp-probe
node src/cli.mjs login-cdp https://target.example/login --profile target-service
node src/cli.mjs search-cdp 'site:example.com docs' --provider duckduckgo --profile public
node src/cli.mjs target-bootstrap-plan --name target-service --origin https://target.example,https://auth.target.example --login-url https://auth.target.example/login --page-url https://target.example/dashboard --permissions clipboard,downloads --format compact
node src/cli.mjs scaffold-target target-service --origin https://target.example,https://auth.target.example --login-url https://auth.target.example/login --page-url https://target.example/dashboard --permissions clipboard,downloads
node src/cli.mjs target-doctor runs/target-packs/target-service
node src/cli.mjs target-audit runs/target-packs/target-service
node src/cli.mjs target-proof-inventory --real-external --format markdown
node src/cli.mjs target-proof-inventory --real-external --format compact
node src/cli.mjs target-proof-inventory --real-external --strict --format json
node src/cli.mjs target-proof-next --real-external --format compact
node src/cli.mjs target-candidate-plan --format compact
node src/cli.mjs target-candidate-plan --candidate github --format compact
node src/cli.mjs target-approval-pack --candidate github --format compact
node src/cli.mjs target-approval-status --candidate github --real-external --format compact
node src/cli.mjs target-approval-preflight --candidate github --real-external --format compact
node src/cli.mjs target-approval-resume --candidate github --real-external --format compact
node src/cli.mjs target-approval-resume --candidate github --real-external --run --operator-ok OK --format compact
node src/cli.mjs target-proof-plan runs/target-packs/target-service --real-external --format markdown
node src/cli.mjs target-proof-plan runs/target-packs/target-service --real-external --format compact
node src/cli.mjs target-proof-plan runs/target-packs/target-service --real-external --strict --format json
node src/cli.mjs target-auth-check runs/target-packs/target-service --write --status-out auth-check-status.json --daemon --strict --format compact
node src/cli.mjs target-auth-watch runs/target-packs/target-service --status-out auth-watch-status.json --timeout-ms 300000 --interval-ms 5000 --format compact
node src/cli.mjs target-proof-capture runs/target-packs/target-service --real-external --format markdown
node src/cli.mjs target-proof-capture runs/target-packs/target-service --real-external --format compact
node src/cli.mjs target-proof-capture runs/target-packs/target-service --real-external --run --wait-auth --wait-auth-status-out wait-auth-status.json --completion-audit --format markdown
node src/cli.mjs target-batch runs/target-packs/target-service --real-external --format compact
node src/cli.mjs target-batch runs/target-packs/target-service --real-external --run --wait-auth --format compact
node src/cli.mjs completion-proof-bundle --include-compact-command-audit --format compact
node src/cli.mjs completion-proof-bundle --include-compact-command-audit --write --out operator/completion-proof-bundle-latest.json --format compact
node src/cli.mjs completion-proof-bundle-status --format compact
node src/cli.mjs agent-proof-checklist --candidate github --format compact
node src/cli.mjs agent-proof-checklist-status --in operator/agent-proof-checklist-latest.json --format compact
node src/cli.mjs agent-proof-closeout --candidate github --include-compact-command-audit --format compact
node src/cli.mjs agent-proof-closeout-status --in operator/agent-proof-closeout-latest.json --format compact
node src/cli.mjs objective-completion-audit --strict --format compact
node src/cli.mjs objective-safe-command --format compact
node src/cli.mjs objective-proof-pipeline --monitor-timeout-ms 10000 --monitor-interval-ms 1000 --format compact
node src/cli.mjs target-handoff-status runs/target-packs/target-service --handoff operator-handoff.json --format compact
node src/cli.mjs target-handoff-run runs/target-packs/target-service --handoff operator-handoff.json --command post-login-capture --format compact
node src/cli.mjs target-handoff-resume runs/target-packs/target-service --handoff operator-handoff.json --format compact
node src/cli.mjs target-proof runs/target-packs/target-service --real-external --write --benchmark-file runs/target-packs/target-service/proof/target-benchmark.json
node src/cli.mjs target-info runs/target-packs/target-service
node src/cli.mjs target-status runs/target-packs/target-service
node src/cli.mjs target-add-url runs/target-packs/target-service https://target.example/reports
node src/cli.mjs target-login runs/target-packs/target-service
node src/cli.mjs target-login-capture runs/target-packs/target-service --real-external --wait-auth-status-out wait-auth-status.json --completion-audit --format markdown
node src/cli.mjs target-permissions runs/target-packs/target-service apply
node src/cli.mjs target-autostart runs/target-packs/target-service write
node src/cli.mjs target-autostart runs/target-packs/target-service load
node src/cli.mjs target-autostart runs/target-packs/target-service status
node src/cli.mjs target-autostart runs/target-packs/target-service unload
node src/cli.mjs target-daemon runs/target-packs/target-service start
node src/cli.mjs target-daemon runs/target-packs/target-service status
node src/cli.mjs target-run runs/target-packs/target-service diagnose --daemon
node src/cli.mjs target-run runs/target-packs/target-service observe --daemon
node src/cli.mjs target-run runs/target-packs/target-service inspect --daemon
node src/cli.mjs target-run runs/target-packs/target-service analyze --daemon
node src/cli.mjs target-run runs/target-packs/target-service operate --daemon
node src/cli.mjs target-run-status runs/target-packs/target-service operate --format compact
node src/cli.mjs target-operate-add runs/target-packs/target-service fill --selector 'input[name=q]' --value-env SEARCH_TEXT --as fill_search
node src/cli.mjs target-operate-add runs/target-packs/target-service click --selector 'button[type=submit]' --as submit_search
node src/cli.mjs target-operate-add runs/target-packs/target-service wait-for --selector 'main' --text 'Results' --as wait_results
node src/cli.mjs target-run runs/target-packs/target-service screenshot --daemon
node src/cli.mjs target-run runs/target-packs/target-service crawl --daemon
node src/cli.mjs target-run runs/target-packs/target-service crawl-links --daemon
node src/cli.mjs target-scrape runs/target-packs/target-service --daemon
node src/cli.mjs target-daemon runs/target-packs/target-service stop
node src/cli.mjs target-run runs/target-packs/target-service outline
node src/cli.mjs target-run runs/target-packs/target-service links
node src/cli.mjs run-cdp examples/cdp-form-recipe.json --profile cdp-recipe-probe
node src/cli.mjs run-cdp examples/cdp-wait-recipe.json --profile cdp-recipe-wait-probe
node src/cli.mjs run-cdp examples/cdp-screenshot-recipe.json --profile cdp-recipe-shot --manifest
node src/cli.mjs run-cdp examples/cdp-form-recipe.json --profile cdp-recipe-probe --out result.csv --format csv --result result --manifest
node src/cli.mjs outline-playwright 'data:text/html,<h1>OK</h1>'
node src/cli.mjs capture-har https://example.com --out example.har
node src/cli.mjs har-summary runs/example.har --out example-summary.json
node src/cli.mjs reap-owned
node src/cli.mjs extract https://target.example/page --profile target-service --state-only
node src/cli.mjs search 'site:example.com docs'
```

Use `--engine lightpanda` only with the `public` profile until target-specific compatibility is proven:

```bash
node src/cli.mjs lightpanda-doctor --format compact
SBA_LIGHTPANDA_PATH=/path/to/lightpanda node src/cli.mjs benchmark --url https://example.com --iterations 1 --write --out provider-benchmarks/lightpanda-public.json --format json
node src/cli.mjs playwright-doctor --format compact
node src/cli.mjs outline-playwright 'data:text/html,<h1>PW</h1>'
npm run probe:chrome
npm run probe:cdp
npm run probe:observe-cdp
npm run probe:analyze-cdp
npm run probe:scrape-cdp
npm run probe:inspect-cdp
npm run probe:wait-cdp
npm run probe:console-cdp
npm run probe:screenshot-cdp
npm run probe:operate-cdp
npm run probe:cdp-daemon
npm run probe:recipe-cdp
npm run probe:recipe-wait
npm run probe:recipe-screenshot
npm run probe:recipe-csv
npm run probe:auth-local
npm run probe:target-auth
npm run probe:profile-status
npm run probe:control-status
npm run probe:agent-loop-step
npm run probe:agent-loop-step-status
npm run probe:agent-proof-step
npm run probe:agent-proof-step-start
npm run probe:agent-proof-step-status
npm run probe:agent-control-plane
npm run probe:agent-control-plane-status
npm run probe:agent-control-plane-watch
npm run probe:chrome-control-plan
npm run probe:chrome-mcp-timeout-plan
npm run probe:regular-chrome-use
npm run probe:chrome-apple-events-status
npm run probe:chrome-apple-events-enable-plan
npm run probe:chrome-apple-events-outline
npm run probe:browser-route
npm run probe:chrome-extension-status
npm run probe:chrome-extension-handoff
npm run probe:chrome-extension-resume
npm run probe:chrome-extension-troubleshoot
npm run probe:chrome-extension-troubleshoot-after-retry
npm run probe:chrome-extension-backend-check-plan
npm run probe:chrome-extension-claim-plan
npm run probe:providers
npm run probe:agent-browser-doctor
npm run probe:provider-doctor-status
npm run probe:sources
npm run probe:lightpanda-doctor
npm run probe:lightpanda-decision
npm run probe:playwright-doctor
npm run probe:selenium-doctor
npm run probe:secret-audit
npm run probe:secret-setup-plan
npm run probe:secret-run-plan
npm run probe:secret-run-select
npm run probe:secret-env-handoff
npm run probe:secret-env-handoff-status
npm run probe:secret-env-handoff-watch
npm run probe:benchmark
npm run probe:target-benchmark
npm run probe:runtime-audit
npm run probe:runtime-cleanup-plan
npm run probe:run-gate-audit
npm run probe:readiness
npm run probe:objective-completion-audit-status
npm run probe:objective-completion-audit-watch
npm run probe:objective-next
npm run probe:operator-pack
npm run probe:operator-runbook
npm run probe:operator-runbook-status
npm run probe:operator-runbook-watch
npm run probe:proof-gate-status
npm run probe:proof-gate-watch
npm run probe:background-monitor-plan
npm run probe:background-proof-capture-plan
npm run probe:background-proof-capture-status
npm run probe:background-proof-capture-start
npm run probe:objective-resume
npm run probe:mcp
npm run probe:mcp-compact
npm run probe:scaffold
npm run probe:target-doctor
npm run probe:target-audit
npm run probe:target-proof-inventory
npm run probe:target-proof-next
npm run probe:target-proof-plan
npm run probe:target-auth-check
npm run probe:target-proof-capture
npm run probe:target-proof
npm run probe:target-status
npm run probe:target-bootstrap-plan
npm run probe:target-candidate-plan
npm run probe:target-candidate-plan-status
npm run probe:target-candidate-plan-watch
npm run probe:target-approval-pack
npm run probe:target-approval-status
npm run probe:target-approval-preflight
npm run probe:target-approval-resume
npm run probe:target-approval-resume-status
npm run probe:target-approval-resume-watch
npm run probe:target-add-url
npm run probe:target-login
npm run probe:target-permissions
npm run probe:target-daemon
npm run probe:target-autostart
npm run probe:target-observe
npm run probe:target-inspect
npm run probe:target-diagnose
npm run probe:target-screenshot
npm run probe:target-crawl
npm run probe:target-crawl-links
npm run probe:target-scrape
npm run probe:target-run
npm run probe:target-search
npm run probe:search-cdp
npm run probe:outline
npm run probe:playwright
npm run probe:lightpanda
```

Use `--out file.json` for redacted JSON under `runs/`. Use `--format csv --result <name>` when an extraction result should become a UTF-8 BOM CSV for spreadsheets. Multi-page recipes can use a path such as `--result 'pages[].results.links'`; those rows include `pageIndex`, `inputUrl`, and `pageUrl`. Add `--manifest` to write `<output>.manifest.json` with command, profile, policy, format, and timestamp.
