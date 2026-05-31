#!/usr/bin/env sh
set -eu
profile="verify-$$"

cleanup() {
  node src/cli.mjs target-daemon "runs/target-packs/$profile-target" stop >/dev/null 2>&1 || true
  node src/cli.mjs target-autostart "runs/target-packs/$profile-target" remove >/dev/null 2>&1 || true
  rm -rf "profiles/$profile"
  rm -rf "profiles/$profile-extract"
  rm -rf "profiles/$profile-observe"
  rm -rf "profiles/$profile-inspect"
  rm -rf "profiles/$profile-wait"
  rm -rf "profiles/$profile-console"
  rm -rf "profiles/$profile-screenshot"
  rm -rf "profiles/$profile-click"
  node src/cli.mjs cdp-stop --profile "$profile-daemon" >/dev/null 2>&1 || true
  rm -rf "profiles/$profile-daemon"
  rm -rf "profiles/$profile-recipe"
  rm -rf "profiles/$profile-recipe-wait"
  rm -rf "profiles/$profile-recipe-screenshot"
  rm -rf "profiles/$profile-recipe-csv"
  rm -rf "runs/target-packs/$profile-target"
  rm -f "runs/$profile-recipe.csv"
  rm -f "runs/$profile-recipe.csv.manifest.json"
  rm -f "runs/$profile-screenshot.png"
  rm -f "runs/$profile-screenshot.png.manifest.json"
  rm -f "runs/$profile-scrape.csv"
  rm -f "runs/$profile-scrape.csv.manifest.json"
  rm -f "runs/recipe-shot.png"
  rm -f "runs/recipe-shot.png.manifest.json"
}
trap cleanup EXIT

npm run verify
node scripts/auth-smoke.mjs
node scripts/target-auth-smoke.mjs
node src/cli.mjs outline-cdp 'data:text/html,<h1>CDP</h1><a href="/cdp">Link</a>' --profile "$profile"
node src/cli.mjs observe-cdp 'data:text/html,<main><h1>CDP</h1><a href="/cdp">Link</a><label>Search<input name="q"></label></main>' --profile "$profile-observe"
node src/cli.mjs analyze-cdp 'data:text/html,<main><h1>Catalog</h1><script>console.log("ready")</script><ul><li class="item"><a href="/a">A</a><span>100</span></li><li class="item"><a href="/b">B</a><span>200</span></li></ul></main>' --profile "$profile-observe"
node src/cli.mjs scrape-cdp 'data:text/html,<main><h1>Catalog</h1><ul><li class="item"><a href="/a">A</a><span>100</span></li><li class="item"><a href="/b">B</a><span>200</span></li></ul></main>' --profile "$profile-observe" --out "$profile-scrape.csv" --format csv --manifest
node src/cli.mjs inspect-cdp 'data:text/html,<main><h1>Catalog</h1><ul><li class="item"><a href="/a">A</a><span class="price">100</span></li><li class="item"><a href="/b">B</a><span class="price">200</span></li></ul></main>' --profile "$profile-inspect"
node src/cli.mjs wait-cdp 'data:text/html,<main><h1>Wait</h1><script>setTimeout(()=>{const p=document.createElement("p");p.id="ready";p.textContent="Ready";document.body.appendChild(p)},50)</script></main>' --selector '#ready' --text Ready --profile "$profile-wait"
node src/cli.mjs console-cdp 'data:text/html,<script>console.log("hello",42);console.error("bad");setTimeout(()=>{throw new Error("boom")},20)</script>' --wait-ms 150 --profile "$profile-console"
node src/cli.mjs screenshot-cdp 'data:text/html,<main style="background:white"><h1>Shot</h1></main>' --out "$profile-screenshot.png" --profile "$profile-screenshot" --manifest
node src/cli.mjs profile-status --profile "$profile-screenshot"
npm run probe:control-status
npm run probe:providers
npm run probe:sources
npm run probe:lightpanda-doctor
npm run probe:secret-audit
npm run probe:secret-setup-plan
npm run probe:secret-run-plan
npm run probe:benchmark
npm run probe:runtime-audit
npm run probe:runtime-cleanup-plan
npm run probe:readiness
npm run probe:mcp
npm run probe:mcp-compact
node src/cli.mjs cdp-start --profile "$profile-daemon"
node src/cli.mjs cdp-status --profile "$profile-daemon"
node src/cli.mjs outline-cdp 'data:text/html,<h1>Daemon</h1><a href="/d">D</a>' --profile "$profile-daemon" --daemon
node src/cli.mjs cdp-stop --profile "$profile-daemon"
node src/cli.mjs cdp-status --profile "$profile-daemon"
node src/cli.mjs extract-cdp 'data:text/html,<a href="/x">Link</a>' --selector a --fields text,href --profile "$profile-extract"
node src/cli.mjs click-cdp 'data:text/html,<h1>Before</h1><button id="go" onclick="document.querySelector(&quot;h1&quot;).textContent=&quot;After&quot;">Go</button>' --selector '#go' --profile "$profile-click"
node src/cli.mjs scaffold-target "$profile-target" --origin https://example.com --page-url https://example.com --query "example domain" --permissions clipboard,downloads --force
node src/cli.mjs target-doctor "runs/target-packs/$profile-target"
node src/cli.mjs target-audit "runs/target-packs/$profile-target"
node src/cli.mjs target-info "runs/target-packs/$profile-target"
node src/cli.mjs target-status "runs/target-packs/$profile-target"
node src/cli.mjs target-add-url "runs/target-packs/$profile-target" https://example.com/
node src/cli.mjs target-login "runs/target-packs/$profile-target" --dry-run
node src/cli.mjs target-login-capture "runs/target-packs/$profile-target" --dry-run --format markdown
node src/cli.mjs target-login-capture "runs/target-packs/$profile-target" --dry-run --handoff-out operator-handoff.json --format json >/dev/null
node src/cli.mjs target-handoff-status "runs/target-packs/$profile-target" --handoff operator-handoff.json --format compact
node src/cli.mjs target-handoff-resume "runs/target-packs/$profile-target" --handoff operator-handoff.json --format compact
node src/cli.mjs target-permissions "runs/target-packs/$profile-target" status
node src/cli.mjs target-permissions "runs/target-packs/$profile-target" plan
node src/cli.mjs target-permissions "runs/target-packs/$profile-target" set --allow clipboard,downloads
node src/cli.mjs target-permissions "runs/target-packs/$profile-target" apply
node src/cli.mjs target-permissions "runs/target-packs/$profile-target" status
node src/cli.mjs target-autostart "runs/target-packs/$profile-target" plan
node src/cli.mjs target-autostart "runs/target-packs/$profile-target" write
node src/cli.mjs target-autostart "runs/target-packs/$profile-target" status
node src/cli.mjs target-autostart "runs/target-packs/$profile-target" remove
node src/cli.mjs target-autostart "runs/target-packs/$profile-target" status
node src/cli.mjs target-daemon "runs/target-packs/$profile-target" start
node src/cli.mjs target-daemon "runs/target-packs/$profile-target" status
node src/cli.mjs target-run "runs/target-packs/$profile-target" observe --daemon
node src/cli.mjs target-run "runs/target-packs/$profile-target" inspect --daemon
node src/cli.mjs target-run "runs/target-packs/$profile-target" diagnose --daemon
node src/cli.mjs target-run "runs/target-packs/$profile-target" screenshot --daemon
node src/cli.mjs target-run "runs/target-packs/$profile-target" crawl --daemon
node src/cli.mjs target-run "runs/target-packs/$profile-target" crawl-links --daemon
node src/cli.mjs target-scrape "runs/target-packs/$profile-target" --daemon
node src/cli.mjs target-daemon "runs/target-packs/$profile-target" stop
node src/cli.mjs target-daemon "runs/target-packs/$profile-target" status
node src/cli.mjs target-benchmark "runs/target-packs/$profile-target" --recipes observe,inspect --iterations 1 --format markdown
node src/cli.mjs target-proof-plan "runs/target-packs/$profile-target" --format markdown
node src/cli.mjs target-proof "runs/target-packs/$profile-target" --format markdown
node src/cli.mjs target-run "runs/target-packs/$profile-target" outline
node src/cli.mjs run-cdp examples/cdp-form-recipe.json --profile "$profile-recipe"
node src/cli.mjs run-cdp examples/cdp-wait-recipe.json --profile "$profile-recipe-wait"
node src/cli.mjs run-cdp examples/cdp-screenshot-recipe.json --profile "$profile-recipe-screenshot" --manifest
node src/cli.mjs run-cdp examples/cdp-form-recipe.json --profile "$profile-recipe-csv" --out "$profile-recipe.csv" --format csv --result result --manifest
