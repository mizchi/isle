# Isle ユーザーガイド

Isle は、サーバーで生成した HTML を表示し、操作された UI だけを再開するフレームワークです。`.isle` ファイルに状態・表示・イベントと server action の境界を書き、Vite / Rolldown でブラウザー向けのコードを生成します。

現在はプロトタイプです。[npm 配布物の導入手順](../README.ja.md#はじめる)を起点に、Vite アプリへ組み込みます。ブラウザー向け出力は ES2023 と標準の DOM / ESM / fetch を使い、MoonBit や Wasm のランタイムは必要ありません。アプリのビルドにも MoonBit・Z3 は不要です。機能別の [examples](../examples/README.ja.md) にはソース・設定・操作・検査方法を用意しています。

| やりたいこと | ガイド |
|---|---|
| パッケージを導入し、自分の Counter を作る | [はじめる](getting-started.md) |
| 状態・server action・フォーム・読み込み方針を指定する | [アプリを書く](application-guide.md) |
| 親子の component、children、独立した再開を使う | [コンポーネントを組み合わせる](composition.md) |
| 別サイトへ埋め込む、shared / standalone を選ぶ | [widget を使う](widgets.md) |

## 構文と機能の詳細

- [構文リファレンス](prototype-guide.md)：props、state、derive、HTML、イベント、明示 RPC。
- [イベント宣言](events.md)：`event` と `on:click`、明示的な snapshot 引数、同期キャンセル、row の値の受け渡し。
- [テンプレート内 CSS と Z3](inline-css.md)：scoped な `<style>`、SMT 制約、反例、playground の Z3 Wasm。
- [CSS 変数の解析](css-variables.md)：`var()`、継承・カスケード、循環、fallback と移植性の制約。
- [レイアウト契約の形式化](layout-contract-language.md)：ContractIR・LayoutIR・ObligationIR、被覆と適合、親子の要求。
- [Form とアクセシビリティ](forms.md)：入力制約、非同期検証、エラー、pending、reset。
- [チャンクとプロファイル](chunk-profiling.md)：イベント名、manifest、User Timing。
- [静的な負荷予測](static-profiling.md)：入口ごとの仕事量、更新の波及、debug 情報、性能 budget。
- [ページ遷移の先読み](speculation-rules.md)：Speculation Rules の設定。
- [Workers への配布](worker-widget.md)：公開ファイル、CORS、RPC、配備コマンド。

## 現在の対応範囲

使える値の型は `string` / `number` / `boolean` です。props は `component Label(title: string)` のように名前と型で宣言します。無指定の `component` は純粋な共通サブセット、状態・イベントを持つ UI は `client component`、server に限定する UI は `server component` と書きます。

コンポーネントは HTML root または別の component を root とし、タグで入れ子にできます。children には描画専用の `RenderFragment` を使います。ページの入口を Vite の `mounts` に配置します。HTML の標準要素や通常の CSS を使えます。

`.isle` は TypeScript の式・型を基にした専用言語です。`Show` / `Switch` / key 付き `For` / 同期の `ErrorBoundary` は [制御構文の範囲](control-flow.md) で対応しています。任意の TypeScript、import、ユーザー定義関数、File・複数選択フォームは未対応です。client 境界を越える reactive props は未対応で、不変の初期値に限定します。`inline(ts)` / `inline(moonbit)` / `inline(css)`、Content Mapper、一般の async server render は設計段階です。

リリース前のため、構文・API は変更することがあります。通常ページの HTML・snapshot・分割コードは同じビルドで配布します。widget にはバージョンと配布モードの照合があり、異なる版の共有 runtime へ自動的に接続しません。

内部設計や検証へ進む場合は、[設計書](design.md)、[形式モデル](../models/README.md)、[評価シナリオ](../evals/README.md)、[ベンチマーク](../benchmarks/README.md)を参照してください。設計書には未実装の提案も含まれます。

- [テンプレートの制御構文](control-flow.md): 同期の実装範囲、closed array / record、key と寿命、将来の resource 契約。

- [時相的な値とモデル検査](temporal-resources.md): Once の参照意味論、安全性・応答性・公平性と反例の再生。

- [unmount とリソース破棄](resource-disposal.md): resources 設定から component / widget への自動接続、abort と完了、遅い取得、モデル由来の schedule 検査。

- [解決時期の最適化](resolution-optimizer.md): compiler による auto 計画、先読み予算、fetch / evaluate / activate / commit。

- [CSS の解決](style-resolution.md): 非同期 CSS の準備・適用、owner と ShadowRoot、有限モデル。
- [Grid の静的検査](layout-checking.md): 両軸の box model、親子契約、media/container と反例領域。
- [リジェクト例を実行する](layout-rejections.md): violated / unknown の14例と対応版。
