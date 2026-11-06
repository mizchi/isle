# Isle サンプル集

[English](README.md) · 日本語 · [パッケージ導入](../README.ja.md#はじめる)

公開 API を使う機能別の例です。パッケージ導入後、関係するソースと設定を自分の Vite アプリへ取り込めます。共通 shell / config helper はデモ間の重複を減らすためのもので、runtime の必須機能ではありません。

| 試す機能 | 操作と確認 |
| --- | --- |
| [TodoMVC](todomvc/) | Todo の追加・編集・絞り込み・保存と、Qwik・Preact との production サイズ比較。 |
| [最小の Counter](hello/) | SSR した値を増やし、初期値へ戻す。 |
| [ブラウザー JS のない SSR](ssr-only/) | ビルドに Isle runtime・snapshot・handler chunk が含まれないことを確認する。 |
| [動的な表示だけ更新](partial-updates/) | 一つの値を変更し、静的見出しと無関係な出力の DOM が保持されることを確かめる。 |
| [入れ子と children](composition/) | 親と子を独立に再開し、純粋 component の children を表示する。 |
| [分岐・key 付きリスト・例外](control-flow/) | 分岐を切り替え、key 付き行を並べ替え、空配列で @empty と同期 @catch を確認する。 |
| [manifest による読み込み](loading/) | manifest の先読み判断を調べ、入力時には Search だけが活性化することを確認する。 |
| [リソースの寿命と破棄](resources/) | 所有された timer と listener を活性化し、component を削除して一度だけ破棄されることを見る。 |
| [遅延 CSS と準備完了](styles/) | setup module と CSS を読み込み、setup から見える適用済み style を調べる。 |
| [標準の遷移先読み](navigation/) | Speculation Rules の data block と通常リンクを確認する。Isle の browser JS は出力しない。 |
| [標準フォームの検証](form/) | 不正入力・必須同意・送信成功を、ラベル付きのフォームで試す。 |
| [共通 schema とサーバー検証](schema-form/) | taken@example.com の重複エラーを確認し、修正・送信・reset を試す。 |
| [明示的な server action](counter/) | 独立した Counter と、検証・認可を経由する文書名変更を試す。 |
| [CSS 契約の3つの結果](layout-contracts/) | reset を考慮した Grid/subgrid 契約で verified・violated・unknown を確認する。 |
| [ポータブルな Web Components](portable-widget/) | 複数 widget をマウントし、共有版・standalone 版・版の不一致の拒否を確認する。 |
| [Workers からの widget 配信](worker-widget/) | widget-dev と widget-host を別 terminal で起動し、別 origin に固定サイズの Shadow DOM widget を埋め込む。 |

## リポジトリ内の例を起動する

リポジトリのデモ実行には [開発者向け環境](../docs/contributing.md)を使います。コンパイラ開発用の MoonBit が必要ですが、アプリへの npm 導入とは別の手順です。

```sh
just examples-list
just example hello
just example-build hello
just examples-build
just examples-check
```

各 README に操作とポートを記載しています。widget と CSS 契約には専用のコマンドもあります。ビルド後の `isle.manifest.json` と `isle.cost.json` で、コード参照・先読み判断・仕事量の上限を確認できます。
