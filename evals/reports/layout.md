# Grid の横幅契約を検査する

2026-11-06。CSS の box model と Grid の親子関係を扱う、明示的な compiler CLI pass を実装した。実装の対象は horizontal-tb / ltr の横幅、閉じた CSS と静的 box tree、有限な viewport 区間である。[契約と使い方](../../docs/layout-checking.md)を参照。

本記録は横幅検査の導入段階を記す。後続の container query / 両軸対応と現行の検証結果は [追加評価](layout-axes.md)を参照する。

```sh
just layout
just layout-check
just layout-quality
```

`just layout` は `.isle` の frontend / composition lowering と CSS 解析を経て、JSON の検査結果を出す。全体は verified / violated / unknown に分け、verified だけを exit 0にする。禁止する float、非 Grid container、明示列外への配置、重なり、幅不足、折り返し方針との不一致を診断する。未知の CSS や動的構造を成功としない。

CSS parser は build 用の PostCSS 8.5.32を直接依存にした。すでに Vite の推移依存に存在する版である。browser runtime と Vite の生成経路へ checker を import しない。CSS DSL や自動補正は導入せず、公開する型契約と CLI の sidecar で補う。

## Red → Green → Refactoring

先に node テストを追加し、未実装の API、続いて CLI に対する失敗を確認した。主な反例は二列への breakpoint を600pxに置いた場合の `[600, 608)`。親の content 幅 `V - 32` に対し、sidebar 240 + gap 16 + main 320 が必要なためである。608pxへ修正すると、宣言した352〜1280pxの全区間で義務が成立する。

幾何計算を有理数の affine 式へ分離し、CSS parser / cascade、box tree と契約の抽出、検査結果の契約を分けた。media 境界の一点と開区間を別に扱い、同じ式の違反区間を最後に結合する。単一 breakpoint の代表幅だけを検査する方法ではない。

追加の仕様確認では、fr 合計が1未満のとき、単純に合計で正規化すると誤って verified になる反例を検出した。`minmax(0, 0.5fr)` に500pxを与えると250pxになるケースを Red にし、配分の分母を `max(1, fr 合計)` に修正した。browser でも padding を除いた468pxの半分、234pxとなることを確認した。

Grid の auto-placement は、確定 row の配置を先に予約してから sparse な自動配置を行う。source 順に一度だけ処理すると誤るケースを browser と照合した。overflow-x/y の computed value の相互作用も実際の `getComputedStyle()` と比較した。

## 検証

`just ci` は MoonBit 53、Node 265、browser 117、既存の形式検査92ケースを通過した。browser は既存67、制御構文4、resource15、自動取得計画3、CSS24、今回の layout4。Form a11y の2 suite・各8 gate も通過した。veri のモデルを増やして連続寸法を有限サンプルへ置き換えてはいない。

layout の対象 Node 17ケースには CLI、読解 grader、区間計算、CSS / media / cascade / box / Grid の検査を含む。区間計算の oracle は、符号の異なる係数と切片、開閉の端点に対して30,492点を独立した整数計算で照合する。これは判定器の無制限の健全性証明ではない。型契約 fixture も tsc を通過した。[検証記録](../results/layout/validation.json)。

Playwright では、故障版・修正版それぞれについて352・599・600・604・607・608・609・1280pxを観測した。故障版の600・604・607pxで main の割当幅が320pxを下回り、320pxの子があふれる。修正版では同じ点の割当幅と overflow が正常になる。[browser 測定](../results/layout/browser.json)、[故障版](../results/layout/broken.json)、[修正版](../results/layout/fixed.json)。

`vlmkit/0.24.0` の integrity と、宣言した352〜1280pxの responsive gate は通過した。integrity の near-empty 警告は、短い検査用 component であるため残す。375pxでは Navigation と本文が縦に並び、1280pxでは左右に並ぶことを画像でも確認した。[375px](../results/layout/375.png)、[1280px](../results/layout/1280.png)。

最初に responsive gate を既定の320pxから実行した際は、契約外の狭い幅で実際の overflow を検出した。その結果を隠さず [範囲外の検査記録](../results/layout/responsive-outside-domain.json)に保存する。成功の保証は宣言範囲についてだけであり、320px対応を実装したという意味ではない。

生成された通常 counter の JS は直前の CSS 解決版と比較し、hash と raw / gzip サイズの一致を確認した。[サイズ記録](../results/layout/size.json)。解析器やレポートの容量を browser の配布サイズへ加算しない設計である。

## 残る範囲

font metrics と許可入力に関する minInlineSize は trusted な仮定であり、自動推論された証明ではない。CSS を全て収集した保証も caller に残る。block size、subpixel rounding、paint overflow、縦 scrollbar、動的分岐 / loop、container query、subgrid、intrinsic track、CSS の広い selector / cascade 機能は後続である。

CSS-ready と owner の時相モデルとは別の静的制約検査であり、compiler / browser 全体の意味保存証明は未実施。次の候補は component 境界のサイズ summary、container 幅を入力にする条件、許可した動的構造の分岐合成である。[記述・読解課題と grader](../scenarios/layout/brief.md)を用意したが、独立した参加者による評価は未実施。
