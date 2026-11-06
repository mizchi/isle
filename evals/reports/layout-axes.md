# Container query と両軸のサイズ契約

2026-11-06。横幅の検査を、container size query と縦方向へ拡張した。標準 CSS と template IR を入力にする明示的な compiler CLI pass であり、browser runtime は追加しない。[現行仕様](../../docs/layout-checking.md)を参照。

```sh
just layout-axes
just layout-check
just layout-quality
```

## 実装と反例

先に9ケースの受入テストを追加し、未対応 query と block オプションで Red を確認した。既存の横幅専用 engine は、幅・高さを変数にする有理数の affine engine へ置き換えた。CSS / cascade、条件、box tree / 入力契約、Grid の配置、領域の切り出しを分離した。

条件の比較と義務違反は、閉じた凸領域を有理数の半平面で分割して扱う。strict な不等号、開いた端点、等号で線・一点になる領域を区別する。幅と高さを代表値へ固定したモデル検査ではない。2次元の射影範囲は外接区間であるため、反例の正本に vertices と strict constraints を保存する。

container query は、名前と feature に合う最も近い祖先を選ぶ。名前は case-sensitive、対象自身は選ばない。inline-size container は height の query 対象から外し、その先の size container を選ぶ。query は padding / border を除いた content box を参照し、適格な祖先がなければ不成立とする。外部 host の祖先はないことが現在の解析境界の前提である。

fixture の Shell は左右16pxの padding を持つ。二列には固定200px + gap16px + 本文400pxが必要なので、container 条件は616px、viewport は648pxから成立する。条件を600pxへ変えると、viewport `[632, 648)` で本文が不足する。縦方向は、一列で padding32 + 固定行80 + gap8 + 本文200 = 320px、二列で padding32 + 本文200 = 232pxを必要とする。

block-size、padding-block、border、row-gap、固定 / auto / fr row、両軸の overflow 契約を接続した。auto 行は子の高さを下から求める。fr row の definite / indefinite sizing と、auto row の余剰伸長を区別する。percentage と intrinsic sizing が循環する場合は unknown にし、p / heading 等の native block margin には明示 reset を要求する。

## 検証

`just ci` は MoonBit 53、Node 279、browser 120、既存の形式検査92ケース・想定反例35件を通過した。browser の内訳は既存67、制御構文4、resource15、自動取得計画3、CSS24、layout7。型契約と評価 corpus、Form a11y 2 suite・各8 gate も通過した。[検証記録](../results/layout-axes/validation.json)。

layout の Node 31ケースには、前段の横幅検査、container / block の11ケース、CLI、読解 grader、区間 / 領域の検査を含む。型は別途 tsc で検査する。1次元は30,492点、2次元は91,125点の bounded arithmetic oracle を使う。2次元の oracle は係数の正負、比較演算5種、幅・高さの格子点について yes / no の両方を独立した整数計算で確認する。これは無制限の健全性証明ではない。

Playwright は、前段4ケースに新規3ケースを追加した。

- 故障版と修正版の42組の幅×高さについて、モデルの反例領域と browser の割当幅・高さ・実際の overflow を照合した。
- height query が中間の inline-size container を飛ばし、size ancestor を選ぶことを確認した。content height 300pxの条件は viewport height 332pxから成立する。
- 自動行の高さ148px、size containment 時の32px、indefinite fr 行の168px、auto と0.5frを混ぜた固定300pxの container を native Grid と比較した。

[browser 測定](../results/layout-axes/browser.json)、[修正版](../results/layout-axes/fixed.json)、[故障版](../results/layout-axes/broken.json)に保存した。修正版の保証範囲は width432〜1000px、height320〜600pxである。短い高さも含む故障版の反例を、保証範囲から削除して成功に見せてはいない。

`vlmkit/0.24.0` は480×400と1000×500の integrity、および宣言した幅・高さの responsive gate を通過した。少量の検査用テキストによる near-empty 警告は残す。画像では狭い表示の Navigation と本文が縦に並び、広い表示では左右に並ぶことを確認した。[480×400](../results/layout-axes/480x400.png)、[1000×500](../results/layout-axes/1000x500.png)。

production counter の生成 JS は前段と hash まで同一で、raw / gzip の増分0 Bだった。[サイズ記録](../results/layout-axes/size.json)。parser・solver・diagnostics を browser の依存グラフへ入れない。

## 保証の前提と後続

minInlineSize / minBlockSize は必要サイズの上界、intrinsicBlockSize は **trusted な exact auto-height** であり、意味を混同しない。幅別 profile を宣言できるが、font / 入力全般の計量や改行位置を自動推論したわけではない。profile が未定義の幅や、definite な高さが必要な percentage の循環は unknown にする。

CSS / DOM の閉じた境界、入力されたサイズ契約、未モデル化の scrollbar gutter がないことに依存する。paint overflow、browser rounding、任意 font、style / scroll-state query、cq 単位、row span、subgrid、動的構造の合成は未対応である。CSSOM / browser 全体の refinement 証明や、この判定器の形式的な健全性証明は未実施。veri の既存92ケースにこの連続幾何の検査を加算しない。

[記述・読解課題](../scenarios/layout-axes/brief.md)と `layout-axes-intent` grader を追加した。独立した参加者による書きやすさ・読解の評価は未実施。
