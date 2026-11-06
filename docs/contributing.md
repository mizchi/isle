# Developing Isle / Isle の開発

This guide is for contributors working on the compiler, runtime, models and evaluation suite. App consumers use the [package setup](../README.md#quick-start).

The documentation/demo site is built with Isle too: see [site](../site/README.md), or run `just site-dev`. `just site-check` checks the Pages prefix, static exports and interactions; `just site-quality` runs the visual/accessibility gates.

コンパイラ・runtime・形式モデルを開発するための手順です。アプリへ導入する場合は [パッケージ利用の手順](../README.ja.md#はじめる)を使ってください。

## 試す

Node.js 24+、pnpm、MoonBit が必要です。検証に Z3 も使います。確認済み compiler は moonc v0.10.19+97801ee1b、形式モデルの依存は mizchi/veri 0.2.1。

```sh
pnpm install
moon update
just dev
```

http://127.0.0.1:4173/ で Counter と明示 RPC のデモを表示します。`just build` は production の HTML と遅延 handler chunks を dist/ に出力します。host を登録した Vite preview では同じローカル Request→Response adapter も動きます。実配備は環境に合わせて `createActionHandler()` を接続してください。

## 開発・検証コマンド

```sh
just check    # MoonBit の警告なし型検査
just test     # MoonBit + Node tests
just verify   # 有限モデル92ケースと公平な応答性 + 小さい証明 + 偽命題の拒否
just layout   # Grid / box model の横幅契約、media 条件と反例区間
just layout-axes # Container query と両軸のサイズ契約、反例領域
just layout-reset # CSS reset・box-sizing の継承・cascade layer を含む検査
just layout-subgrid-check # 親トラック共有・MoonBit/veri・ブラウザー照合
just layout-rejections # リジェクト14例と、それぞれの対応版を CLI で再現
just overview-build # README の説明画像を実行可能な例から再生成
just overview-check # 掲載コード・生成画像・事実ラベルの整合性を検査
just overview-quality # 説明画像と README の配置を vlmkit で検査
just control-check # 制御構文の型・SSR・生成サイズ・key の寿命を検証
just resource-binding-check # 初回 resume の取得と component / widget の自動破棄
just loading-check # コンパイラによる先読み計画と取得・評価・初期化の分離
just style-check # CSS の準備・適用・owner と ShadowRoot の寿命
just eval     # 記述・読解 corpus / 保存済み参加者結果の再採点
just build
just e2e      # dev / production の Playwright
just ci       # 上記を順番に実行
just compare  # Qwik / Preact と同じ UI をビルド・操作・転送量・見た目で比較
just compare-static # 静的装飾 / 属性だけのケースのサイズと SSR/resume の見た目を比較
just dev-form # Form / native validation のデモ（4190）
just a11y-form # production Form の keyboard / contrast / touch 等の8 gate
just dev-schema-form # 共通 schema / async validation / pending / reset のデモ（4191）
just dev-composition # 入れ子、children、親と子の状態のデモ（4192）
just a11y-schema-form # schema Form の8 gateと初期・エラー・保存後の画像
just widget-check # Workers Static Assets + CORS RPC / Shadow DOM / CLS の検証
just widget-dev # Cloudflare workerd 上の widget（8787）
just widget-host # 別サイトから固定サイズで埋め込む親ページ（8788）
just widget-portable-dev # 別アプリを任意パスから配信する Node の例（8793/portable/）
```

## リファレンス・設計・評価

- [記述ガイド](prototype-guide.md)：現在動く構文と意味規則。
- [Form とアクセシビリティ](forms.md)：入力・submit・標準制約・ラベル検査と残る機能。
- [Schema IR と action の契約](schema-contracts.md)：小さな schema DSL の範囲、action ごとの非同期検証、TS データ宣言との比較。
- [ページ遷移の先読み](speculation-rules.md)：Speculation Rules の prefetch / prerender と、island の遅延読み込み。
- [64項目のアプリでの速度比較](../benchmarks/dashboard/README.md)：Qwik / Preact と同じ操作を繰り返し測定するダッシュボード。
- [Workers と第三者 widget](worker-widget.md)：固定 width/height の埋め込み、CLS、Cookie に依存しない RPC と配備手順。
- [Widget の共通設計](widget-architecture.md)：Vite による生成、版の完全一致と standalone 配布、Custom Element / imperative mount、任意の配信パスと Node adapter。
- [次段階の DSL 設計](design.md#21-宣言-dsl-と処理本体を分ける案)：inline(ts/moonbit/css)、live と CSS を含む必要性解析。新構文は未実装。
- [チャンクとプロファイル](chunk-profiling.md)：名前付きイベント境界、source/manifest の対応、User Timing。
- [解決時期の最適化](resolution-optimizer.md)：auto の先読み予算、依存閉包、取得・評価・活性化・commit。
- [非同期 CSS の解決](style-resolution.md)：CSS-ready、cascade 順序、ShadowRoot、有限モデルとブラウザ検査。
- [Grid の静的検査](layout-checking.md)：親子の両軸契約、overflow、media/container 分岐と反例。
- [デモのソース](../examples/counter/app.isle)：state、derive、server action、remote。
- [評価シナリオ](../evals/README.md)：正解・実装・過去試行を隠した著者／読者評価。
- [フレームワーク比較](../benchmarks/README.md)：共通シナリオ、測定条件、再実行手順と実測結果。
- [v1](../evals/reports/v1.md) / [v2](../evals/reports/v2.md)：実測点数、迷いの引用、修正と残る課題。
- [unmount とリソース破棄](resource-disposal.md)：component への自動接続、所有・遅い取得結果・一度だけの解放とモデル由来の schedule 検査。
- [時相的な値と Once](temporal-resources.md)：安全性・公平な応答性・SSR からの再開を検査する参照意味論。
- [形式モデル](../models/README.md)：有限領域、反例、証明の範囲。
- [設計書](design.md)：最終目標。v0 に未実装の提案も含む。

## 実装の境界

`compiler/` は外部 I/O を持たない MoonBit frontend、`lib/` は Node/Vite adapter と codegen、`runtime/` は DOM/ESM の小さな client runtime、`models/` は独立した参照モデルです。`evals/` は課題・attempt・期待値・採点結果を分けています。

v0 は required props、state、derive、DOM template、component の入れ子と children、state assignment、schema/view、明示 action と remote、Form と検証を扱います。閉じた record / array と `@if` / `@switch` / key 付き `@for` / 同期の `@try` も実装しています。Vite の resources 指定から client component の取得・破棄を自動接続できます。制御構文の backend には owner・Form・HTML の制約があります。任意 TypeScript、inline、import、resource / `@pending` の専用構文、union の網羅性、Content Mapper、一般の server async render は未対応です。

server host の認証・policy・operation は trusted adapter です。デモの principal は server 固定値で、実ログインではありません。prepare は副作用を持たず、commit は同期の in-memory mutation に限定します。実 DB transaction、完全な情報フロー、compiler/JS/browser 全体の形式証明を実装したとは扱いません。

有限モデルは owner、security、forms、region、resource、CSS 解決の92ケースを検査し、35反例を再生します。探索範囲と仮定は [形式検査の記録](formal-methods.md)に示します。moon prove は純粋な2record storeの小さい契約です。ユーザー・LLM 全般に対する書きやすさを保証する評価ではなく、現在は小さい課題を4参加者で試した初期データです。

## 機能別 examples

`just examples-list` で一覧、`just example hello` で起動、`just examples-build` で通常ページの全例をビルド、`just examples-check` でカタログ・ビルド・ブラウザー操作を検査する。widget の配布と CSS 契約にはカタログ記載の専用検査もある。

`just examples-quality` は新規8例の integrity / copy / scroll / handlers / interactions を検査する。結果は `evals/results/examples/quality.json`。

## npm 配布物を検査する

```sh
just package-build
just package-check
```

`package-build` は MoonBit frontend を JavaScript へビルドしてから `artifacts/isle-prototype-0.0.1.tgz` を生成する。レジストリへ publish しない。`package-check` は archive を別アプリへ展開し、宣言された依存・peer だけを供給して、MoonBit のない PATH で英日 README の同じ3ファイルをビルドする。CLI、公開型ファイルの同梱、非公開 import の拒否も検査する。PostCSS は配布物の解析用依存、Vite は利用側の peer として宣言する。
