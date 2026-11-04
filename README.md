# secure-browser-agent

secure-browser-agentは、エージェントによるWebブラウザ操作において、事前に定義したポリシーに基づいて呼び出しを検査するための管理ツールです。ブラウザ自動化エンジンと連携し、指定ドメインのリストによるアクセス先の限定や、プロファイル分離の適用を試みます。

ログインが必要なWebサービスを専用プロファイルで巡回させたい場面や、エージェントがアクセスするURLをあらかじめ定めた対象範囲に絞り込んでブラウザ操作を委ねたい場面に向いています。

本ツールはブラウザ呼び出し時のポリシー検査を行うものであり、すべてのネットワーク通信やリダイレクトの完全な遮断、外部入力に含まれる悪意ある指示の無害化を保証するものではありません。

## Position

This tool is intentionally a thin orchestration layer:

- `agent-browser`: default execution engine for fast CDP control, compact accessibility snapshots, profile/state persistence, and low token usage.
- Playwright: compatibility layer for tests, richer automation APIs, and future remote CDP targets.
- Lightpanda: candidate fast crawler/rendering backend for non-authenticated or low-risk dynamic pages.
- Selenium: compatibility option for WebDriver/BiDi ecosystems, not the default for agent-first scraping.

## Safety Defaults

- URL allowlist is required: edit `config/example-policy.json` or set `SBA_POLICY`.
- Managed browser state is stored under `profiles/.sba-profile-v2/`, which is gitignored. Names must be lowercase portable ASCII letters, digits, `-`, `_`, or internal dots; Windows reserved device names and trailing dots are rejected. Existing uppercase or previously sanitized names must be replaced with a valid name.
- This is a compatibility change: legacy profiles and their logged-in state are not automatically reused or moved. If the same legacy name exists, creating a fresh v2 profile requires explicitly setting `"allowFreshV2Profile": true` in the selected policy. The operator must then log in again; this does not migrate the old state. Unmarked or incomplete v2 directories are rejected rather than adopted.
- v2 markers coordinate cooperating instances; they are not authentication against someone who can alter the files. Symlink/junction replacement, filesystem aliasing and noncooperative writers are not fully confined. Explicit CDP port or handoff connections attach to an existing browser and are outside the managed profile identity guarantee.
- `reap-owned` can report candidate v2 processes and profiles, but applying a nonempty plan now fails without changes: PID reuse cannot be safely excluded, and a missing process match does not prove that a profile is unused. It does not stop legacy processes or delete legacy profiles.
- Profile and target-worker status describe v2 only; `legacyStatus: "not_checked"` does not imply that a legacy browser or session has stopped.
- **Experimental limitation:** this branch cannot safely reuse or stop detached CDP daemons across invocations. A new detached daemon can be started but cannot be safely managed afterwards. Child-process signaling can also target a reused PID after exit. This branch is incomplete and unsafe to run as a finished daemon implementation.
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
| [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) | Third-party terms and the AGPL boundary |

## License

MIT — [LICENSE](LICENSE)

依拠する第三者ソフトウェアと外部サービスの規約は [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) に集約している。
同梱している第三者コードは無い（`dependencies` / `devDependencies` は共に空）。実行エンジンはすべて別プロセスとして呼び出す。

Lightpanda と SearXNG は AGPL-3.0 のため、取り込み・改変・同梱を禁止する境界を
[THIRD-PARTY-NOTICES.md §4](THIRD-PARTY-NOTICES.md#4-agpl-30-の境界重要) に定めている。
その境界を越える変更をする場合は、先に同節を更新すること。
