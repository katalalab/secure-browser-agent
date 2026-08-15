# Third-Party Notices

本リポジトリが依拠する第三者ソフトウェアと外部サービスの一覧。ライセンス・規約のURLはここに集約する。

- 本ソフトウェア本体のライセンス: [MIT](LICENSE)
- **同梱している第三者コードは無い。** `package.json` の `dependencies` / `devDependencies` は共に空
- 以下はすべて**別プロセスとして呼び出す**、または**HTTP越しに利用する**外部ソフトウェア／サービス

最終確認: 2026-08-15（ライセンス種別は `gh api repos/OWNER/NAME` で実測、URLは HTTP 200 を確認）

---

## 1. ブラウザ実行エンジン（別プロセスとして起動）

- **agent-browser** — Apache-2.0 — https://github.com/vercel-labs/agent-browser
  既定の実行エンジン。CDP制御・アクセシビリティスナップショット・HAR取得
- **Playwright** — Apache-2.0 — https://github.com/microsoft/playwright
  互換層。テストとHAR記録（`recordHar`）に使用
- **Lightpanda** — **AGPL-3.0** — https://github.com/lightpanda-io/browser
  高速クローラ／レンダリング候補。**§4 の境界を必ず読むこと**
- **Selenium** — Apache-2.0 — https://github.com/SeleniumHQ/selenium
  WebDriver/BiDi 互換オプション。既定では使わない

## 2. エージェント連携（MCP サーバー／ドライバ）

- **chrome-devtools-mcp** — Apache-2.0 — https://github.com/ChromeDevTools/chrome-devtools-mcp
- **playwright-mcp** — Apache-2.0 — https://github.com/microsoft/playwright-mcp
- **Model Context Protocol** — ライセンス表記は `NOASSERTION`（要個別確認） — https://github.com/modelcontextprotocol/modelcontextprotocol
- **cua (cua-driver)** — MIT — https://github.com/trycua/cua
  一部同梱コンポーネントは別ライセンス（OmniParser は CC-BY-4.0、オプションの ultralytics は AGPL-3.0）。利用する機能に応じて上流の表記を確認すること

## 3. 検索・索引（設計上の参照先。現時点で未組込）

- **SearXNG** — **AGPL-3.0** — https://github.com/searxng/searxng
  メタ検索。自前 index を持たない。**§4 の境界を必ず読むこと**
- **xerj** — Apache-2.0 — https://github.com/xerj-org/xerj
  索引層のアルゴリズム参照元（Block-Max WAND / FST fuzzy / doc-values filtered kNN）。
  **コードは取り込んでいない。設計の参照のみ**

## 4. AGPL-3.0 の境界（重要）

Lightpanda と SearXNG は AGPL-3.0。本リポジトリは MIT。両立させるための境界を明示する。

- 本リポジトリは両者の**ソースコードを一切取り込まない／改変しない／再配布しない**
- 利用形態は**独立したプロセスへの外部インターフェース越しの呼び出し**に限る
  （Lightpanda は CDP over WebSocket、SearXNG は HTTP）
- したがって本リポジトリのコードは AGPL-3.0 の派生著作物にはならない

**この境界を越える変更をする場合は、先に本節を更新すること。** 具体的には次のいずれかを行う時:

- Lightpanda / SearXNG のソースを vendoring する、フォークを同梱する、パッチを当てて配布する
- 同一プロセス内へリンクする（静的・動的を問わない）
- 改変版をネットワーク越しにユーザーへ提供する（AGPL-3.0 §13 のネットワーク条項が発動する）

AGPL-3.0 全文: https://www.gnu.org/licenses/agpl-3.0.html

## 5. 外部サービスの利用規約

コードのライセンスとは別に、**アクセスするサービス側の規約**が適用される。自動アクセスを行う前に確認すること。

- DuckDuckGo — 規約 https://duckduckgo.com/terms ／ プライバシー https://duckduckgo.com/privacy
- Google — 規約 https://policies.google.com/terms
- GitHub — 規約 https://docs.github.com/site-policy/github-terms/github-terms-of-service

SearXNG 経由で検索する場合、**転送先エンジンそれぞれの規約が適用される**点に注意。
SearXNG がまとめて免責するわけではない。有効化するエンジンを絞る運用上の理由でもある。

対象サービスごとの許諾状況は `config/` のポリシーファイル側で管理する。
**本リポジトリは URL allowlist 既定拒否**であり、明示的に許可されていないオリジンへはアクセスしない。

## 6. ライセンス参照

- MIT — https://opensource.org/license/mit
- Apache-2.0 — https://www.apache.org/licenses/LICENSE-2.0
- AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

---

## 更新手順

外部ソフトウェア／サービスを追加・変更したら、**同じ変更の中で本ファイルを更新する**。後回しにしない。

1. ライセンス種別を実測する — `gh api repos/OWNER/NAME -q '.license.spdx_id'`
   （README の記述ではなく API の値を使う。両者が食い違うリポジトリが実在する）
2. URL が生きているか確認する — `curl -sS -o /dev/null -w '%{http_code}' -L <url>`
3. AGPL / GPL / SSPL 系なら **§4 に境界を書く**。書けないなら採用しない
4. サービスを叩くなら §5 に規約URLを足す
5. 冒頭の「最終確認」日付を更新する
