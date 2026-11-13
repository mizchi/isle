# Isleの開発

ユーザーには日本語で答える。

## プロジェクトの目的

Isleは、Qwik型の事前コンパイルとresumeを基盤とするUIライブラリであり、
CSSのレイアウト契約をcomponentの型システムへ組み込むことを目的とする。
静的解析できる専用文法から、必要な取得・復元・部分更新だけを生成する。

最初に以下を読む。

1. [目的と設計原則](docs/project-purpose.md)
2. [別環境への引き継ぎ](docs/handoff.md)
3. [ADRと実装計画](docs/adr/README.md)

## 開発スタイル

- TDDで進める。探索 → Red → Green → Refactoring。
- KPIやカバレッジ目標がある場合は達成まで検証する。
- 不明瞭な要件は確認する。既存のユーザー指示と実装から解決できる事項は進める。
- 関心を分離し、状態とロジック、契約/API/型と実装を分ける。
- public APIとIRの契約を厳密に定義し、実装を置換可能に保つ。
- 現行実装、提案、有限モデルで確認した範囲を区別する。ADRのProposedは実装済みを意味しない。

## 実装上の原則

- 最終的な配信runtimeのサイズを最優先する。検査IR、Z3、説明情報はbuild/debug側に置く。
- ES2023とWeb標準を優先し、チャンク分割はVite/Rolldownへ接続する。
- アプリの記述はTS前提の制約付きDSL。`event`と`on:click`等を使い、`inline(ts)`を要求しない。
- compiler frontendと開発用の有限モデルには現在MoonBitを使う。アプリのbrowser runtimeへMoonBit/Wasmを追加しない。
- 汎用CSS検証は`packages/css-verifier/`に置く。同packageからIsle、ProgramIR、compilerをimportしない。
- Isle adapterがtemplate、状態候補、key、owner、source位置を汎用コアへ渡す。
- 契約、実装由来の事実、証明義務を分離する。要求を実装の前提にして自己証明しない。
- 未対応、被覆不足、上限超過、timeoutを成功へ変えない。
- 現行`@noshift`は対象の存在・位置・寸法の契約。ブラウザーのCLSや中間frameまで保証したと説明しない。

## ツールと検証

- タスクは`justfile`、Node.jsは24+、パッケージ管理は`package.json`指定のpnpm 12を使う。
- E2EはPlaywright。対象に合う検査を[引き継ぎ手順](docs/handoff.md)から選ぶ。
- `just test`がcompilerを生成してからMoonBit/Nodeテストを実行する。`pnpm test`単独はcompiler生成を含まない。
- Playwrightのdev serverを使う検査中はcompiler/JSを編集・再buildしない。HMRによる別versionの混在を避ける。
- サイズはHTML、snapshot、bootstrap、JS、CSS、操作時の取得量を分けて記録する。
- 依存関係の変更では`pnpm install --frozen-lockfile`が通る状態を保つ。
- `_build/`、`.mooncakes/`、`node_modules/`、`dist/`、`test-results/`は生成物であり、Gitに依存せず再生成する。

GitHubは`mizchi/isle`、通常の作業branchは`main`。commit/pushはユーザーの指示範囲で行う。
