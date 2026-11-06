# CSS contract outcomes / CSS 契約の3つの結果

[All examples](../README.md) · [サンプル一覧](../README.ja.md)

## English

Source / ソース: [app.isle](app.isle) · [layout.json](layout.json) · [overflow.json](overflow.json) · [unknown.json](unknown.json)

Run verified, overflow/violated and unsupported/unknown cases using reset-aware Grid contracts. Run the three configs below. Only the verified case exits 0. Both violated and unknown exit 1. Results apply to declared size/text contracts; unknown is not a successful proof.

From a repository checkout, run at the repository root:

```sh
just example layout-contracts
```

Check: `just examples-check`. For a consumer app, install the package and use the [npm setup](../../README.md#quick-start); the source files here show the feature and its configuration.

## 日本語

reset を考慮した Grid 契約で verified・overflow の violated・未対応の unknown を試す。 下の3設定を実行する。verified のみ終了コード0、violated と unknown は1。宣言したサイズ・テキスト契約の範囲の検査であり、unknown は検証成功ではない。

リポジトリ内の例は、ルートで上記コマンドを実行する。検査は `just examples-check`。利用者のアプリへ組み込む場合は [npm パッケージの導入手順](../../README.ja.md#はじめる)を使い、このディレクトリのソースと設定を参照する。

```sh
node tools/isle.mjs layout examples/layout-contracts/app.isle examples/layout-contracts/layout.json
node tools/isle.mjs layout examples/layout-contracts/app.isle examples/layout-contracts/overflow.json
node tools/isle.mjs layout examples/layout-contracts/app.isle examples/layout-contracts/unknown.json
```

## Subgrid

[subgrid.isle](subgrid.isle), [subgrid.css](subgrid.css) and [subgrid.json](subgrid.json) share two parent columns and two rows. `A` ends at the first parent row, alongside `Peer`; `B` starts in the second row and column. Padding/borders affect outer tracks, and `gap: normal` follows the parent's gap. Run `just layout-subgrid` for static diagnostics or `just layout-subgrid-check` for the finite model and browser comparison. Parent auto-row intrinsic contributions and named lines remain unknown. Keep size query containers on the parent Grid. See [semantics and limits](../../docs/layout-checking.md#subgrid-の共有トラック).

親の2列・2行を共有する例です。A と Peer の下端は親の最初の行末に揃い、B は2行・2列目に入ります。padding/border は端のトラックへ反映し、省略時の gap は親へ追従します。解析結果は `just layout-subgrid`、有限モデルとブラウザー照合は `just layout-subgrid-check`。親の auto 行への intrinsic contribution と名前付き line は unknown とします。size query container は親の Grid に置きます。
