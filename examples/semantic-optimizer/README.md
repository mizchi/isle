# Semantic optimizer / 意味論からの最適化

[Source](app.isle) · [Guide / 解説](../../docs/semantic-optimizer.md)

## English

This is a compiler and browser-test fixture. `Details` can only open: its initial summary needs no browser factory. Only `user.name` is captured from the readonly User. `Idle` writes a value no observer reads, so its event and snapshot disappear.

Paste [app.isle](app.isle) into the playground, select `Details`, and supply:

```json
{"summary":"Initial preview","user":{"name":"Ada","biography":"Not needed after resume"}}
```

Open Details and repeat the action. Select `Idle` with `{}` to inspect a fully static result. From this checkout, `just semantic-optimizer-check` runs the tests and size report; this directory does not have a standalone Vite app. The size baseline disables these three transforms on the same checked input; it is not a framework comparison.

## 日本語

コンパイラとブラウザ検査用のfixture。`Details`は開く方向にしか変わらないため、初回summaryの再生成factoryが不要になる。readonlyなUserからは`user.name`だけをcaptureする。`Idle`の値は誰も読まないため、イベントとsnapshotを消せる。

playgroundに[ソース](app.isle)を貼り、`Details`と上記propsを選ぶ。開いた後の繰り返し操作も試す。`Idle`はpropsを`{}`にすると静的な出力を確認できる。リポジトリでは`just semantic-optimizer-check`でテストとサイズ報告を実行する。単独のViteアプリではない。比較対象は同じ入力の3変換を止めた出力で、他フレームワークとの比較ではない。
