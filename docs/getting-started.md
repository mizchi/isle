# はじめる

Isle を自分の Vite アプリへ追加する手順です。Node.js 24+ と Vite 8.3.5+ を使います。コンパイル済み frontend は npm 配布物に含まれるため、利用者に MoonBit・Z3・コンパイラの checkout は不要です。

配布状態とインストール、最小の3ファイルは [README の導入手順](../README.ja.md#はじめる)にまとめています。現時点の package は private 設定なので、公開前は受け取った npm アーカイブを使います。公開 API はレジストリ配布と同じ `@isle/prototype/vite` です。

## 最小のアプリから広げる

1. アプリへパッケージと Vite をインストールする。
2. `app.isle` に状態・表示・イベントを書く。
3. HTML の `<!--isle:ssr-->` と、Vite plugin の entry / mounts を設定する。
4. `pnpm exec vite` で開き、操作する。`pnpm exec vite build` で `dist/` を生成する。

`state` は変更できる値、`derive` はその値から計算する式です。イベント名は生成コードと計測結果の境界にもなります。単純な Counter には追加の browser entry は不要です。

| 次に試す機能 | ソースと操作 |
| --- | --- |
| Counter と reset | [hello](../examples/hello/) |
| 初期化を再実行せず、動的な表示だけ変更する | [partial-updates](../examples/partial-updates/) |
| props・children と親子の独立した再開 | [composition](../examples/composition/) |
| 共通 schema と非同期フォーム検証 | [schema-form](../examples/schema-form/) |
| setup と unmount 時の破棄 | [resources](../examples/resources/) |
| CSS の遅延読み込み | [styles](../examples/styles/) |
| 外部サイトへの埋め込み | [portable-widget](../examples/portable-widget/) |

[15例の一覧](../examples/README.ja.md)には各機能の説明と検査方法があります。ソース中の共通 config helper はデモ用です。自分のアプリでは README のように `isle()` を直接 Vite 設定へ組み込みます。

## 配信する

静的な HTML と JS/CSS は `dist/` を配信します。server action があるアプリは、`@isle/prototype/server` の `createActionHandler()` と server host を Request / Response adapter に接続してください。Vite のローカル host 設定だけで production の RPC endpoint が生まれるわけではありません。

生成した HTML、snapshot、chunks は同じビルドで配布します。SSR 専用なら Isle の browser JS は出力しません。widget の共有 runtime は版の完全一致を要求します。

コンパイラ自体を変更する場合に限り、[開発者向けセットアップ](contributing.md)を使います。
