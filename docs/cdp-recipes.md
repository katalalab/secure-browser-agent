## CDP Recipes

`analyze-cdp` is the default first probe for agents. It opens the page once and returns compact observation, scraping candidates, console diagnostics, network summary, and `suggestedExtractors` in one redacted JSON object.

`scrape-cdp` runs the same analysis and then extracts rows from the best suggested selector, or from `--selector` when provided. Use `--suggestion N` to choose a different `suggestedExtractors` entry, and `--out rows.csv --format csv` to write spreadsheet-ready rows.

`observe-cdp` returns a compact, low-token page view: title, URL, counts, top headings, limited links, forms, controls, and a short text sample. Use it before `outline-cdp` when an agent needs to decide the next action without reading a full page inventory.

`inspect-cdp` returns scraping candidates: repeated item selectors, table summaries, link counts, field hints, and sample rows. Use it before writing `extract-cdp` selectors or target recipes.

`wait-cdp` waits for a selector, text fragment, or URL fragment before returning. Use it after navigation or login redirects when dynamic pages need time to render.

`console-cdp` captures console log/error and uncaught exception summaries through CDP without dumping full page content. Use it to debug background automations and failed scrapes.

`screenshot-cdp` saves a PNG screenshot under `runs/` without bringing Chrome to the foreground. Use `--manifest` to write sidecar metadata with profile, policy, output path, and byte count.

Direct CDP commands use the regular macOS Google Chrome app by default (`/Applications/Google Chrome.app/...`) with a dedicated automation profile. Set `SBA_CHROME_PATH` to force a specific binary, or `SBA_PREFER_AGENT_BROWSER_CHROME=1` to prefer the agent-browser Chrome for Testing cache.

`cdp-start`, `cdp-status`, and `cdp-stop` manage a background Chrome/CDP process for one dedicated profile. Add `--daemon` to `outline-cdp`, `observe-cdp`, `analyze-cdp`, `scrape-cdp`, `inspect-cdp`, `extract-cdp`, `wait-cdp`, `console-cdp`, `screenshot-cdp`, `fill-cdp`, `click-cdp`, `network-cdp`, `search-cdp`, `run-cdp`, or `target-run` to reuse that process. The daemon metadata stores PID, local CDP port, profile path, headed/headless mode, and start time; it does not store cookies or page data.

`run-cdp` executes a small JSON workflow in one dedicated Chrome profile. Supported step types are `goto`, `search`, `search-status`, `fill`, `click`, `wait`, `wait-for`, `console`, `screenshot`, `extract`, `inspect`, `observe`, and `outline`. A recipe can use either `url` for a single page or `urls` for a multi-page sweep inside one browser session. A `search` step expands to provider navigation, outline, and `search-status`, so authenticated search sessions can be reused with `--profile` and provider challenges are machine-readable.

For transient local recipes, `run-cdp` retries once after a CDP socket close only when every recipe URL is local (`data:` or `about:blank`). External URLs, daemon runs, selector failures, and other page errors are not retried, so authenticated operations are not duplicated silently.

Example:

```json
{
  "url": "data:text/html,%3Ch1%3EBefore%3C/h1%3E",
  "steps": [
    { "type": "fill", "selector": "#q", "value": "hello" },
    { "type": "click", "selector": "#go" },
    { "type": "wait-for", "selector": "#result", "text": "hello", "timeoutMs": 2000 },
    { "type": "console", "as": "logs" },
    { "type": "screenshot", "out": "after-click.png", "as": "shot" },
    { "type": "extract", "selector": "#result", "fields": ["text"], "as": "result" },
    { "type": "outline", "as": "page" }
  ]
}
```
