# secure-browser-agent

Safe local wrapper around `agent-browser` for authenticated browser analysis and scraping.

## Position

This tool is intentionally a thin orchestration layer:

- `agent-browser`: default execution engine for fast CDP control, compact accessibility snapshots, profile/state persistence, and low token usage.
- Playwright: compatibility layer for tests, richer automation APIs, and future remote CDP targets.
- Lightpanda: candidate fast crawler/rendering backend for non-authenticated or low-risk dynamic pages.
- Selenium: compatibility option for WebDriver/BiDi ecosystems, not the default for agent-first scraping.

## Safety Defaults

- URL allowlist is required: edit `config/example-policy.json` or set `SBA_POLICY`.
- Browser state is stored under `profiles/`, which is gitignored.
- `--profile` is the default persistence mode. `--state-only` is available for Playwright-style storage-state workflows, but it is not combined with `--profile`.
- Do not attach to the normal Chrome profile. Use a dedicated profile per target service.
- DOM, network bodies, and page text are untrusted data. They are never treated as instructions.
- Secrets should enter through existing browser login or a vault-backed workflow, not command-line arguments.
- CDP launch readiness waits up to 30 seconds by default. Set `SBA_CDP_LAUNCH_TIMEOUT_MS` higher on a loaded machine before treating `DevToolsActivePort` startup delays as browser failure.

## Quick Start

Node.js 22 or newer.

```bash
# 1. allowlist the URLs you intend to touch (required — there is no implicit allow)
$EDITOR config/example-policy.json      # or point SBA_POLICY at your own copy

# 2. check the environment
node src/cli.mjs doctor

# 3. ask what the agent loop should do next
node src/cli.mjs agent-next --format compact
```

Installed globally the CLI is `sba`. The examples in the docs use `node src/cli.mjs`
so they work directly from a checkout.

## Documentation

| Document | Contents |
| --- | --- |
| [docs/commands.md](docs/commands.md) | Full command reference |
| [docs/verification.md](docs/verification.md) | Verification commands and proof gates |
| [docs/authenticated-profile.md](docs/authenticated-profile.md) | Authenticated profile lifecycle |
| [docs/cdp-recipes.md](docs/cdp-recipes.md) | Raw CDP recipes |
| [docs/PAGE_INTELLIGENCE_DESIGN.md](docs/PAGE_INTELLIGENCE_DESIGN.md) | Page intelligence design notes |
| [docs/speed-systems.md](docs/speed-systems.md) | Throughput and latency notes |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Contribution workflow |
| [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) | Third-party terms and the AGPL boundary |

## License

MIT — [LICENSE](LICENSE)

依拠する第三者ソフトウェアと外部サービスの規約は [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) に集約している。
同梱している第三者コードは無い（`dependencies` / `devDependencies` は共に空）。実行エンジンはすべて別プロセスとして呼び出す。

Lightpanda と SearXNG は AGPL-3.0 のため、取り込み・改変・同梱を禁止する境界を
[THIRD-PARTY-NOTICES.md §4](THIRD-PARTY-NOTICES.md#4-agpl-30-の境界重要) に定めている。
その境界を越える変更をする場合は、先に同節を更新すること。
