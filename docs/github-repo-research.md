# GitHub Repo Research Snapshot

Generated from `node src/cli.mjs github-repo-research --limit 8 --write --out research/github-repo-research-latest.json --format compact`.

Snapshot time: 2026-05-31T18:28:07.885Z.

## Recommendation

Keep direct CDP and agent-browser as the authenticated default, use Playwright for regression tests, keep Chrome DevTools MCP as a companion lane for existing Chrome tabs, benchmark Lightpanda only for public crawl work, and keep Selenium as compatibility fallback.

## Popular GitHub Signals

- `ChromeDevTools/chrome-devtools-mcp`: companion reference for DevTools/MCP ergonomics.
- `vercel-labs/agent-browser`: primary engine reference for agent-facing browser CLI patterns.
- `SeleniumHQ/selenium`: compatibility fallback, not the default agent path.
- `BrowserMCP/mcp`: useful study target for browser MCP operator UX.
- `pinchtab/pinchtab`, `segment-boneyard/nightmare`, `laravel/dusk`: selective pattern review only.

## Starred Repo Signals

- `ChromeDevTools/chrome-devtools-mcp`: aligns with the companion-reference lane.
- `microsoft/Webwright`: study for long-horizon browser-agent task handling.
- `openclaw/Peekaboo`: study for Mac visual capture/operator support.
- Other starred MCP/agent repos were classified as pattern-study material, not direct runtime dependencies.

## Local Clone Signals

- `lightpanda-io/agent-skill` and `lightpanda-io/browser`: public-crawl benchmark candidates.
- `Skyvern-AI/skyvern` and `browser-use/browser-use`: study task planning and recovery patterns without widening auth authority.
- `AgentDeskAI/browser-tools-mcp` and `BrowserMCP/mcp`: study extraction and operator UX ideas.

## Safety Notes

- The research command is read-only against local clones and GitHub metadata.
- It does not clone, fetch, open a browser, start capture, read browser storage, or read secret values.
- Generated raw reports remain under ignored `runs/`; committed docs should contain only summarized metadata.
