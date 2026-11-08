# テンプレート内 CSS と Z3 によるレイアウト検査

native root の直下に `<style>` を書けます。CSS は静的に抽出し、その component が所有する要素へスコープします。`inline(css)` は不要です。

```text
component Four() {
  <main class="row">
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      .row { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); }
      .cell { min-width: 40px; }
    </style>
    <div class="cell" /><div class="cell" /><div class="cell" /><div class="cell" />
  </main>
}
```

CSS の波括弧、文字列、`@media` / `@container` は template 式として解釈しません。CSS 内の state 補間、要素の `style` 属性、条件分岐内の `<style>`、CSS nesting、`@import` / `@font-face` / `@keyframes` は初版の対象外です。class を動的にする場合は string を返す式を使います。

selector は `:is(.cell).i_<hash>` のように所有者を限定します。親の CSS は子 component の内部へ広がりません。pure component の展開、client owner の入れ子、For の行にも同じスコープを保ちます。未到達 component の CSS は除去し、同じ component を複数配置しても stylesheet を重複させません。component 内の未使用 rule の一般的な除去は未対応です。

## Playground

[公開 playground](https://mizchi.github.io/isle/playground/) に次のプリセットがあります。

- **Inline CSS · independent client styles**：親と client の CSS を分離し、クリック後も各色を保つ通常アプリ。
- **Inline CSS · Z3 layout proof**：幅160–640px、高さ80–640pxで反例なし。
- **Inline CSS · overflow witness**：最小幅120pxへ下げ、40pxの箱4つが収まらない反例を取得。
- **Inline CSS · responsive proof**：幅160px未満で2列へ切り替え、幅80pxから検査。
- **CSS variables · responsive proof**：`--cell` と `--columns` の継承・media 内の上書きも検査。[変数の意味論と制限](css-variables.md)。
- **Declared layout · SafeGrid contract**：component 内の `layout SafeGrid` を検査し、親からの割当と宣言の範囲を照合。[文法と意味論](layout-contract-language.md)。

**Verify layout · Z3** を有効にすると、Layout contract の JSON と CSS を専用 Worker へ渡します。compiler Worker とアプリの opaque iframe は分離したままです。通常の Counter を開くだけでは solver を読み込みません。

Inspect output で **Compiled CSS**、**Layout proof**、**SMT-LIB constraints** を選べます。反例には viewport、箱、軸、必要サイズと割り当てサイズを含めます。プレビューは違反の調査にも使えるため、コンパイル・描画の Ready とレイアウトの検証結果は別に表示します。

## production build で制約する

component 本文に `layout SafeGrid { requires { ... } }` があれば、Vite は検査付きビルドを自動で有効にします。root の宣言を既定の viewport 範囲にし、親子の要求も検査します。`wrapMounts:false` と一つの mount を指定します。[宣言付きの実行例](../examples/layout-contracts/declared.isle)と[適合性検査](layout-contract-language.md#ソース宣言と配布環境)を参照してください。

Vite のチェック付きビルドでは、配信する HTML/CSS とモデルを照合し、Z3 の結果まで確認します。CSS をすべて `<style>` に置く場合、空の外部 CSS ファイルは不要です。

```js
isle({
  entry: fileURLToPath(new URL('./app.isle', import.meta.url)),
  mounts: [{ component: 'Four', props: {} }],
  wrapMounts: false,
  layout: {
    viewport: { min: 160, max: 1280, height: { min: 80, max: 900 } },
  },
});
```

外部 CSS を併用する場合は `layout.css`、reset は `layout.reset` にパスを指定します。CSS は reset → 外部 CSS → component CSS の順です。チェック対象は1 document・1 mountで、script や別 stylesheet を後から足して検証をすり抜けることはできません。違反・Unknown・solver timeout はビルドを失敗させます。

`isle.layout.json` は HTML/CSS の hash、宣言範囲、仮定、元の解析 report と `proof` を持ちます。`proof.solver.result` が `unsat` で、モデルが完全なときだけ `verified` になります。Z3 の実バージョンも記録します。

SSR 専用の例は CSS と HTML だけを配信します。通常アプリにも solver・Wasm・CSS parser は入りません。Web Component の descriptor には静的 CSS を含め、ShadowRoot 内で適用します。

## 何を証明するか

既存の [Grid 検査](layout-checking.md) が、closed CSS cascade、box sizing、track、親子関係、media/container の領域、有限の動的構造と scrollbar profile を抽出します。各 obligation の違反を次の形で Z3 へ渡します。

```text
exists width, height, reachable-case:
  viewport-domain
  AND media/container-region
  AND required-size > available-size
```

両軸の affine 式と有理数を浮動小数点へ丸めずに QF_LRA へ変換します。領域の相関、開いた境界、float・grid-only・wrap・overflow の離散的な違反も残します。同じ論理式は共有しますが、検査対象は削りません。

| 結果 | 意味 |
| --- | --- |
| SAT / Violated | モデル上で制約を破る viewport がある |
| UNSAT / Verified | 完全なモデルの宣言範囲内で、制約を破る viewport がない |
| Unknown | CSS・構造が未対応、仮定不足、solver 不明、読み込み失敗、timeout などで判定できない |

未対応の CSS がある場合、数値制約だけが UNSAT になっても Verified にはしません。空の viewport domain も成功扱いしません。CSS 全体やブラウザーを証明するものではなく、文字・フォントの intrinsic bounds、host geometry、scrollbar profiles、pixel rounding の扱いは report の仮定に残ります。

[独立した SMT 仕様](../models/css_layout/README.md)との同値性を機械検査し、壊した仕様では SAT になることも確認します。生成モデルの反例を Chromium で再現し、160pxの修正版も照合します。

## API

```js
import { compile, requireIR } from '@isle/prototype/compiler';
import { analyzeLayout } from '@isle/prototype/layout';
import { verifyLayoutReport } from '@isle/prototype/layout/z3/node';

const ir = requireIR(compile(source));
const report = analyzeLayout(ir, {
  component: 'Four', css: '',
  viewport: { min: 160, max: 640, height: { min: 80, max: 640 } },
});
const proof = await verifyLayoutReport(report);
```

ブラウザー向けの `@isle/prototype/layout/z3` は `createLayoutModel(report)` と `verifyLayoutModel(model, api)` を公開します。`api` には Worker 内で初期化した公式 Z3 bindings を渡します。同じ API を使う検査は、同期の context 構築も含めて直列化します。Node adapter は検査ごとに Wasm threads を破棄します。コマンド版 Z3 のインストールは不要です。

## Wasm の配信

公式 Z3 bindings は SharedArrayBuffer を使うため、secure context と cross-origin isolation が必要です。通常のサーバーでは COOP `same-origin` と COEP `credentialless` を設定します。GitHub Pages の playground は、このパスだけの Service Worker で同じ環境を作り、一度 reload します。未保存の source・props・CSS・contract と選択状態を復元します。ドキュメントや通常のデモのパスは分離しません。

worker・factory・Wasm はまとめて内容 hash を付けたパスへ配信し、版の違う asset が混ざらないようにします。読み込みや分離が失敗した場合は Unknown と表示します。これらは playground の配信機能であり、生成アプリのランタイムには入りません。

参照：[Z3 公式 bindings](https://github.com/Z3Prover/z3/blob/master/src/api/js/PUBLISHED_README.md)、[cross-origin isolation](https://developer.mozilla.org/en-US/docs/Web/API/Window/crossOriginIsolated)。

```sh
just inline-css-check
just playground-check
```
