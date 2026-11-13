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

## Independent contracts / 契約と実装を分離して検査する

[declared.isle](declared.isle) writes `layout SafeGrid` inside the component. Run `node tools/isle.mjs layout examples/layout-contracts/declared.isle` without a sidecar. Vite enables the checked document gate automatically for a single unwrapped mount. Source contracts also run in the playground's **Declared layout · SafeGrid contract** preset.

component 内に宣言を書く例です。サイドカーを省略して CLI で検査でき、Vite・playground でも自動的に検査します。実際の割当が requires を満たすかも照合します。

`node examples/layout-contracts/check-contract.mjs` checks [contract.isle](contract.isle) against a separate ContractIR. The four-cell and responsive cases verify; an 8px gap and stronger child requirements produce witnesses. Coverage is checked before conformance. See [the specification and API](../../docs/layout-contract-language.md).

4箱と responsive は Verified、gap 8px と子48pxの要求は Violated です。被覆と適合を別々に検査します。[形式仕様と API](../../docs/layout-contract-language.md)を参照してください。

## Absolute positioning / 絶対配置

[positioned.isle](positioned.isle) names a padding-box coordinate space with `layout PositionedGrid`. Standard CSS positions a fixed overlay; the compiler checks its actual containing block, containment and peer separation. The playground's **Absolute layout · named coordinate space** preset runs the same source with Z3 Wasm.

名前付き座標系とabsoluteの検査例です。親のpadding boxを基準にし、途中のrelativeな親による基準変更や、小数幅でのoverlay衝突も反例にします。transform・scroll等の未対応な意味はUnknownとして扱います。任意の地図SDKや動的marker座標を保証する機能ではありません。

```sh
node tools/isle.mjs layout examples/layout-contracts/positioned.isle
just positioned-layout-check
```

The check includes Vite delivery, browser Z3 and compiled geometry at four widths. [Evaluation results](../../evals/results/positioned-layout/report.json) / [評価シナリオ](../../evals/scenarios/positioned-layout/check.mjs).

## Child coordinate spaces / 子componentの座標系

[positioned-components.isle](positioned-components.isle) composes an in-flow legend and an absolute panel, each with private overlays. The caller binds the panel's public native root. A 160×120px panel receives that CSS-resolved border rectangle as allocation, independently of the surrounding containing block. The parent proof includes each child's requirements and implementation.

親は公開rootの配置とpeerとの衝突を、子はprivateな座標系を検査します。子の保証を仮定して内部を省略する方式ではなく、親の検査へ子の違反も伝えます。未宣言の境界はUnknownです。playgroundの **Absolute layout · child component contracts** で同じ例を編集できます。

```sh
node tools/isle.mjs layout examples/layout-contracts/positioned-components.isle examples/layout-contracts/positioned-components.json --summary
just positioned-components-check
```

[Evaluation results / 評価結果](../../evals/results/positioned-components/report.json) · [Semantics / 意味論](../../docs/layout-contract-language.md#子componentの公開rootとprivateな座標系)

## Noshift across finite states / 状態間の位置・寸法の安定

[noshift-dom.isle](noshift-dom.isle) attaches `@noshift` directly to the control. A fixed 80px slot reserves room for content that switches between 24px and 80px. Vite, the CLI and browser Z3 compare finite candidates using a source-site target ID, independent of class names. Removing reservation produces a 56px movement witness; the annotation adds no application HTML/JS/CSS. Try **Noshift · element requirement** in the playground. [noshift.isle](noshift.isle) retains the selector-contract form.

DOMに要求、CSSに実装、componentのlayoutに環境を書きます。内容の高さが変わっても、下の操作boxが動かないことを検査します。slotの予約を削除すると、各状態でfitしていてもnoshift違反です。DOM注釈は別の同一class要素へ移らず、Forでkey対応が不明ならUnknownです。CLS値や途中のframeを保証する契約ではありません。

[noshift-keys.isle](noshift-keys.isle) compares the same keyed row across DOM reorders. Explicit Grid placement preserves its rectangle; removing the row/column placement exposes a 40px movement. Whole-row insertion/removal starts/ends that row's requirement; surviving keys remain checked. Try **Noshift · keyed rows** in the playground.

For内ではソース上の要素とkey列を対応付けます。行全体の追加・削除と、生存中の行内の対象消失を区別します。重複・不明なkeyはUnknownにし、indexで別の行を借りて成功させません。

```sh
node tools/isle.mjs layout examples/layout-contracts/noshift-dom.isle --summary
node tools/isle.mjs layout examples/layout-contracts/noshift-keys.isle --summary
just noshift-check
```

[API and scope / 保証範囲](../../docs/layout-transitions.md) · [Evaluation / 評価結果](../../evals/results/layout-transitions/declared.json)

## Font-derived text / フォントから導出するテキスト幅

[text-fonts.isle](text-fonts.isle), [text-fonts.css](text-fonts.css) and [text-fonts.json](text-fonts.json) map `Noto Sans JP` to a subset font and declare a name of up to 12 characters from a fixed character set, plus a fixed title. The widths come from [mizchi/font](https://github.com/mizchi/font) shaping, not from trusted numbers. The name may overflow below `17921/64`px and the summary reports how many characters still fit. Run `just css-text-check` for the tests and the Chromium comparison. [text-wrap.isle](text-wrap.isle) wraps fixed text with `wrap: "normal"`: the line-breaking model derives the number of lines at every content width, and the body needs a third line in its 48px row below `14247/64`px. See [ADR-0010](../../docs/adr/0010-font-derived-text-metrics.md).

名前欄に最大12文字、題名に固定文字列を宣言し、幅をフォントのshapingから導出する例です。名前欄は `17921/64`px 未満で溢れ得ると報告し、その幅で収まる文字数も示します。

```sh
node tools/isle.mjs layout examples/layout-contracts/text-fonts.isle examples/layout-contracts/text-fonts.json --summary
```

## Integrity rules / 静的な integrity 検査

[integrity.isle](integrity.isle) is a toolbar with two 24px icon buttons. With `integrity: {targetSize: 24, protrusion: 'painted'}` the layout check also enforces vlmkit's box-model rules over the whole viewport domain: page overflow, protrusion from painted parents, text collision and interactive target size. Shrinking the buttons to 20px is a violation. Open the **Integrity · page overflow, protrusion & 24px targets** preset in the playground. See [ADR-0012](../../docs/adr/0012-static-integrity-rules.md).

24px のアイコンボタンを持つツールバーです。`integrity` を有効にすると、ページの横溢れ・塗りのある親からのはみ出し・テキストの重なり・操作対象の寸法も viewport の全域で検査します。ボタンを 20px にすると違反になります。

## Accessibility rules / DOM と CSS のアクセシビリティ検査

[accessibility.isle](accessibility.isle) is a notice card: a bold title, body text hidden below 360px, and a 24px dismiss button named by `aria-label`. With `accessibility: true` the layout check combines DOM facts with the cascade and geometry over the whole viewport domain: accessible names, text contrast against the composited backgrounds, occluded or overlapping targets, headings, ids, focus and reflow. Removing `aria-label` is `E_A11Y_NAME`; a lighter body color is `E_A11Y_CONTRAST`. Open the **Accessibility · names, contrast & focus** preset in the playground. See [ADR-0013](../../docs/adr/0013-static-accessibility-rules.md).

見出し・本文・24px の閉じるボタンを持つ通知カードです。`accessibility` を有効にすると、名前・コントラスト・覆い・見出し・id・フォーカス・reflow を viewport の全域で検査します。`aria-label` を外すと名前がなく、本文の色を薄くするとコントラスト不足になります。
