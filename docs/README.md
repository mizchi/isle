# Isle ユーザーガイド

Isleは、Qwik型の事前コンパイルとresumeを基盤とするUIライブラリです。CSSのレイアウト契約をcomponentの型システムへ組み込むことを目的としています。`.isle`ファイルに状態・表示・イベント・server actionの境界とlayout契約を書き、Vite/Rolldownでブラウザー向けのコードを生成します。

[目的と設計原則](project-purpose.md)に設計の判断基準を、[別環境への引き継ぎ](handoff.md)にcheckoutからの開発手順と現在の実装範囲をまとめています。

現在はプロトタイプです。[npm 配布物の導入手順](../README.ja.md#はじめる)を起点に、Vite アプリへ組み込みます。ブラウザー向け出力は ES2023 と標準の DOM / ESM / fetch を使い、MoonBit や Wasm のランタイムは必要ありません。アプリのビルドにも MoonBit・Z3 は不要です。機能別の [examples](../examples/README.ja.md) にはソース・設定・操作・検査方法を用意しています。

| やりたいこと | ガイド |
|---|---|
| パッケージを導入し、自分の Counter を作る | [はじめる](getting-started.md) |
| 状態・server action・フォーム・読み込み方針を指定する | [アプリを書く](application-guide.md) |
| 親子の component、children、独立した再開を使う | [コンポーネントを組み合わせる](composition.md) |
| 親所有の行操作とSafeGridを一つのアプリで試す | [npm用の完結例](lexical-review.md) |
| 別サイトへ埋め込む、shared / standalone を選ぶ | [widget を使う](widgets.md) |
| 複雑な非同期UIを試し、DSLとadapterの境界を調べる | [ローカル地図の実験](async-map-experiment.md) |

## 構文と機能の詳細

- [構文リファレンス](prototype-guide.md)：props、state、derive、HTML、イベント、明示 RPC。
- [イベント宣言](events.md)：`event` と `on:click`、明示的な snapshot 引数、同期キャンセル、row の値の受け渡し。
- [テンプレート内 CSS と Z3](inline-css.md)：scoped な `<style>`、SMT 制約、反例、playground の Z3 Wasm。
- [Qwikから移植するresume意味論](resume-semantics.md)：専用言語の根拠、現行の不足を測るeval、依存IR・live入力・局所復元の実装順。
- [観測・片方向の分岐・record captureの最適化](semantic-optimizer.md)：不要な入口、初回専用factory、readonlyなフィールドの削減と再現結果。
- [CSS略記と上書き](css-shorthands.md)：同一ルールのstrict検査、暗黙リセット、意図的なoverride、対応するカスケード。
- [CSS 変数の解析](css-variables.md)：`var()`、継承・カスケード、循環、fallback と移植性の制約。
- [レイアウト契約の形式化](layout-contract-language.md)：ContractIR・LayoutIR・ObligationIR、被覆と適合、親子の要求。
- [汎用CSS検証と静的モデルの方針](static-ui-verification.md)：独立コア、Isle adapter、動的寸法の前提と保証範囲。
- [状態間のレイアウト契約](layout-transitions.md)：noshift/1、位置・寸法・存在の比較、被覆と反例、ブラウザーなしの検査。
- [Form とアクセシビリティ](forms.md)：入力制約、非同期検証、エラー、pending、reset。
- [チャンクとプロファイル](chunk-profiling.md)：イベント名、manifest、User Timing。
- [静的な負荷予測](static-profiling.md)：入口ごとの仕事量、更新の波及、debug 情報、性能 budget。
- [ページ遷移の先読み](speculation-rules.md)：Speculation Rules の設定。
- [Workers への配布](worker-widget.md)：公開ファイル、CORS、RPC、配備コマンド。

## 現在の対応範囲

使える値の型は `string` / `number` / `boolean` です。props は `component Label(title: string)` のように名前と型で宣言します。無指定の `component` は純粋な共通サブセット、状態・イベントを持つ UI は `client component`、server に限定する UI は `server component` と書きます。

コンポーネントは HTML root または別の component を root とし、タグで入れ子にできます。children には描画専用の `RenderFragment` を使います。ページの入口を Vite の `mounts` に配置します。HTML の標準要素や通常の CSS を使えます。

`.isle` は TypeScript の式・型を基にした専用言語です。`Show` / `Switch` / key 付き `For` / 同期の `ErrorBoundary` は [制御構文の範囲](control-flow.md) で対応しています。任意の TypeScript、import、ユーザー定義関数、File・複数選択フォームは未対応です。client 境界を越える reactive props は未対応で、不変の初期値に限定します。処理本体はTS前提で`inline(ts)`は不要、CSSはtemplate内の`<style>`に記述します。Content Mapperと一般のasync server renderは未実装です。

リリース前のため、構文・API は変更することがあります。通常ページの HTML・snapshot・分割コードは同じビルドで配布します。widget にはバージョンと配布モードの照合があり、異なる版の共有 runtime へ自動的に接続しません。

内部設計や検証へ進む場合は、[設計書](design.md)、[形式モデル](../models/README.md)、[評価シナリオ](../evals/README.md)、[ベンチマーク](../benchmarks/README.md)を参照してください。設計書には未実装の提案も含まれます。

[ADRと実装計画](adr/README.md)には、Layout Instabilityの静的検証方針と、反例の説明、動的寸法、予約領域、keyの寿命、検証cache、静的コントラスト、live props、分岐factory分割の計画を記録しています。各案の依存関係、TDD手順、eval、完了条件を確認できます。

- [テンプレートの制御構文](control-flow.md): 同期の実装範囲、closed array / record、key と寿命、将来の resource 契約。

- [時相的な値とモデル検査](temporal-resources.md): Once の参照意味論、安全性・応答性・公平性と反例の再生。

- [unmount とリソース破棄](resource-disposal.md): resources 設定から component / widget への自動接続、abort と完了、遅い取得、モデル由来の schedule 検査。

- [解決時期の最適化](resolution-optimizer.md): compiler による auto 計画、先読み予算、fetch / evaluate / activate / commit。

- [CSS の解決](style-resolution.md): 非同期 CSS の準備・適用、owner と ShadowRoot、有限モデル。
- [Grid の静的検査](layout-checking.md): 両軸の box model、親子契約、media/container と反例領域。
- [リジェクト例を実行する](layout-rejections.md): violated / unknown の14例と対応版。
