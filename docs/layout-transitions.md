# 状態間のレイアウト契約: noshift/1

`@mizchi/css-verifier/transitions` に、二つの状態で指定boxのborder矩形が
変わらないことを検査するAPIを実装しています。ブラウザーを描画せず、CSSから
独立に抽出した前後の幾何モデルをZ3で比較します。Isle固有の構文や状態機械には
依存せず、Isleが作った解析結果も入力できます。IsleではDOM側の`@noshift`を基本にし、
有限な状態候補の比較をVite・CLI・playgroundで実行します。`layout`の`ensures`による
selector指定も、外部・集約指定として利用できます。

## fitとnoshiftを分ける

上の内容が24pxから80pxへ広がり、下に32pxの操作領域があるとします。両者のgapが
8pxなら、操作領域の開始位置は32pxから88pxへ変わります。各状態で画面内に収まっても、
操作領域は56px動きます。

| 実装 | 比較する対象 | 結果 |
|---|---|---|
| 可変の内容をそのまま配置 | 下の操作領域 | 56px移動してviolated |
| 内容を80pxのslot内に配置 | 下の操作領域 | verified |
| 外枠だけ120pxに固定 | 外枠 | verified |
| 同じ固定枠の内部 | 内容の下の操作領域 | 56px移動してviolated |

対象は明示的に指定します。外枠の保証を、そのすべての子孫の保証に読み替えません。
対象の消失もpresence違反として扱い、空集合について等しいという証明にはしません。

## DOM側に要求を書く

```html
<div class="reserved-slot">...</div>
<button @noshift class="action" on:click={toggle} />
```

これはIsleのコンパイル時の注釈です。Web標準のHTML属性ではなく、配信HTMLへは出力しません。
上の断片は、所有componentに`layout SafeGrid`または`layout PositionedGrid`が宣言され、
`toggle`が定義されている前提です。[実行できる全体例](../examples/layout-contracts/noshift-dom.isle)と
playgroundの **Noshift · element requirement** を参照してください。

要求はその要素自身のlayout boxの存在・位置・寸法に対してかかります。子孫へ継承せず、
CSSや予約領域を自動生成しません。DOM注釈が要求、CSSが実装、componentのlayout宣言が
入力領域とprofileを担当します。`@noshift={condition}`のような状態に依存した要求や、
同じ要素への重複指定は拒否します。

コンパイラはソース上の要素へ識別子を付け、汎用box treeの`targets`へ記録します。
class名に依存せず、同じclassの隣接要素があっても対象は混ざりません。条件分岐の別の
要素が同じ場所・classを持っていても、要求を借りて成功することはありません。
`display:none`や分岐によって対象boxがなくなる候補は、presence違反になります。
ここでの存在はlayout boxの存在です。opacity・visibility等のpaint上の可視性や
アクセシビリティツリーへの露出は別の契約です。

この識別子は同一ビルド内の状態候補を対応付ける情報で、HTMLの`id`属性ではありません。
ビルド世代をまたぐ安定性は保証せず、識別子も注釈もアプリruntimeへ追加しません。
一componentあたり、selector指定と合わせて32件までです。初版はnative要素に限定し、
component呼び出しやShow/For等の制御componentへの注釈は拒否します。

## keyで繰り返し要素を対応付ける

```html
<For each={items}>
  {item => <div key={item.id} @noshift class={item.slot} />}
</For>
```

要素のソース位置・Forの出現箇所・外側から内側へのkeyの列で同一性を決めます。
`Fragment key={item.id}`も使えます。同じkeyが別のForや親の行に現れても混ざりません。
universalな子componentへ展開される注釈と、子component自身のselector契約も対応します。
client islandをFor内へ置く構造は、引き続き既存region backendの制約に従います。

| 変更 | 検査 |
|---|---|
| 同じkeyの行を並べ替える | そのkeyの前後のboxを比較。通常の縦並びなら移動を検出 |
| CSS Gridの行・列で位置を保持して並べ替える | 同じborder矩形ならverified |
| 行を追加・削除する | その行の保証の開始・終了。残るkeyは引き続き比較 |
| 先頭行を削除し、残った行が詰まる | 残るkeyの移動としてviolated |
| 生存中の行内で対象だけをShowやCSSで消す | presence違反 |
| Forの空表示に注釈を書く | 行のkeyを持たず、所有componentの生存期間で存在を要求 |

配列の順序と各要素を有限な候補として保持し、keyをruntimeと同じ規則で評価します。
keyはstringまたはsafe integerで、`-0`は不可。同じForの同じ候補内の重複は拒否します。
indexや外側の状態に依存したkeyは既存の`E_CONTROL_KEY`でコンパイルエラーです。
長さだけが分かってもkeyが不明な配列や、候補を列挙できないケースは
`U_LAYOUT_IDENTITY`でUnknownになります。
定数の`Show when={false}`など、コンパイラが到達不能として対象自体を削除した場合は、
要求だけを黙って消さず`E_LAYOUT_UNREACHABLE`で拒否します。注釈を外すか、存在し得る
要素へ要求を置いてください。

各対象を、そのkeyと所有componentが生存する候補すべてで比較します。行全体のunmountを
禁止するものではなく、削除後に同じkeyを再挿入する別の寿命も保守的にまとめて比較する
場合があります。正確なevent graphやremountごとの時系列を復元する機能ではありません。
一配列32行、順序付き配列候補32件、構造候補256件、比較256回が上限です。
上限超過を成功へ丸めずUnknownとし、厳格なビルドを失敗させます。

[noshift-keys.isle](../examples/layout-contracts/noshift-keys.isle)とplaygroundの
**Noshift · keyed rows** は、DOM順を逆転してもGridの配置を保持する例です。
`grid-column` / `grid-row`を除くと40pxの移動を検出します。CLIの`--summary`には
対象のkeyと差分、JSONにはkey列・前後のpathを保存します。対応情報はIsle adapter内で
生成し、汎用CSS検査器には不透明なtarget IDと前後の対応だけを渡します。

## componentからselectorで指定する

```text
layout SafeGrid {
  requires {
    inline-size: 320px..960px;
    block-size: 240px..720px;
  }
  ensures {
    overflow-inline: fit;
    overflow-block: fit;
    noshift ".action";
  }
}
```

`noshift`は`SafeGrid`と`PositionedGrid`の`ensures`内に記述できます。overflowの二項目を
両方とも省略した場合は、profile既定の両軸fitを使います。宣言自体はレイアウトや予約領域を
生成せず、CSS実装を検査します。

対象は単純なtag/id/class selectorで、32件まで。各生存caseで一意な所有box、または
直接の子契約の公開native rootに対応する必要があります。親の宣言から子契約のprivateな
子孫を指定することはできません。不明・曖昧な対象は`U_NOSHIFT_TARGET`です。
可視性は別に検査し、`display:none`の対象はpresence違反になります。

Isle adapterは既存の抽象解釈で、handlerの代入から到達候補を求め、有限な状態・
class/id・Show/For等を展開します。候補は実際の到達可能性を過大近似する場合があります。
許された遷移だけを指定して検査を弱める文法はなく、すべての候補同士の等価を要求します。
同じplatform・対象の生存候補から基準caseを選び、等価の推移律によってN候補をN回の比較で検査します。
基準case自身も検査するため、候補が一つでも消失・座標不足は成功になりません。

比較は現在の呼び出しに与えたpropsとtrustedな内容寸法の前提の下で行います。props全体の
取り得る値を検査する機能ではありません。子の宣言はそのinstanceが生存する候補を対象とし、
その生存期間外のunmountを禁止する契約にはなりません。座標は検査対象全体のrender rootを
基準にするため、親の状態変更で子が動いた場合も対象の移動として検出します。

source上の宣言から汎用コアの明示的な対象対応へlowerし、CSSコアにはIsleの状態や文法を
持ち込みません。構造列挙が不完全、比較上限256回を超える、または座標・solverがUnknownなら
ビルドを失敗にします。source位置とselector、比較元・比較先case、正確な変化量を保存します。

[noshift.isle](../examples/layout-contracts/noshift.isle)はselector指定版、
[noshift-dom.isle](../examples/layout-contracts/noshift-dom.isle)はDOM注釈版です。
どちらも24/80pxの内容を80pxのslotに収めます。

```sh
isle layout panel.isle --summary
```

Viteでは既存のchecked documentの条件に従い、単一のunwrapped mountを使います。

```js
isle({
  entry: './panel.isle',
  mounts: [{component: 'Panel', props: {}}],
  wrapMounts: false,
});
```

`isle.layout.json`の`noshift`に比較回数と結果を保存します。宣言はHTML・snapshot・JS/CSSを
増やしません。playgroundの **Noshift · selector contract** も同じソースを使います。
Nodeで直接呼ぶ場合は`@isle/prototype/layout/noshift/node`の`verifyDeclaredNoShift(ir, report)`、
Workerでは`layout/noshift`の`createNoShiftPlan` / `verifyNoShiftPlan`を使えます。

## API

以下は独立パッケージの例です。パッケージは現在private・レジストリ未公開です。
インストールは[ローカルアーカイブの手順](../packages/css-verifier/README.md)を参照してください。

```js
import {analyzeHTML} from '@mizchi/css-verifier/html';
import {createNoShiftContract} from '@mizchi/css-verifier/transitions';
import {verifyNoShift} from '@mizchi/css-verifier/transitions/node';

const html = '<main class="page"><div class="content"></div><div class="action"></div></main>';
const base = `
  * { box-sizing: border-box; }
  .page { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; }
  .action { height: 32px; }
`;
const scene = height => analyzeHTML(html, {
  name: 'Page',
  css: base + `.content { height: ${height}px; }`,
  viewport: {min: 320, max: 960, height: {min: 240, max: 720}},
});

const expected = createNoShiftContract({
  name: 'Load',
  targets: [{name: 'action', before: 'Page/1', after: 'Page/1'}],
});
const result = await verifyNoShift(scene(24), scene(80), expected);
console.log(result.status);             // violated
console.log(result.change.field);       // blockStart
console.log(result.change.delta.exact); // 56
```

pathは各reportの `elements` から参照します。HTMLとIsleでは構造の抽出方法が異なるため、
別adapterのpathをそのまま推測して使わないでください。対応するboxのpathが異なる場合は
`before` / `after` にそれぞれ指定できます。名前や位置から同一要素を推測しません。
各targetの対応関係はadapterまたは呼び出し側の前提として記録します。

汎用コアはDOM注釈の文法を知りません。別のadapterからも、box treeへ
`targets: ['action']`を渡して、次のような識別子の契約を作れます。

```js
createNoShiftContract({
  name: 'Load',
  targets: [{
    name: 'action',
    before: {id: 'action', within: 'Page'},
    after: {id: 'action', within: 'Page'},
  }],
});
```

`within`はbox pathによる探索範囲です。識別子が見つからなければpresence違反、
重複や`targetIdentity: 'unknown'`ならUnknownになります。完全な構造の情報が
ない場合もUnknownです。識別子の由来と同一性はproducerの前提であり、検査器が
外部入力の識別子を実ブラウザーのDOMへ照合して証明するものではありません。

Isleの既存配布物には、互換入口として `@isle/prototype/layout/transitions` と
`@isle/prototype/layout/transitions/node` もあります。`@isle/prototype/layout` の
`analyzeLayout(ir, options)` で前後のpropsを指定して具体的な二状態を作り、同じAPIへ渡せます。

ブラウザーWorkerではNode用helperを使わず、次の純粋なAPIと初期化済みのZ3 APIを使います。
これらは同じ義務を検査します。UIのプレビュー描画を検証に利用するものではありません。

```js
const transition = createTransitionIR({before, after});
const obligation = createTransitionObligation(expected, transition);
const result = await verifyTransitionObligation(obligation, z3API);
```

上の三関数も `/transitions` のexportです。`TransitionIR` の抽出には契約を渡しません。
IRと義務はimmutableなJSONデータで、debug成果物として保存できます。Node helperはZ3を
初期化し、成功・失敗にかかわらずthreadを終了します。

## 保証する述語

`noshift/1` は、指定されたviewport幅・高さの連続領域のすべての点で、各targetが両状態に
存在し、次の四つが正確に一致することを要求します。

- `inlineStart`: 解析rootのborder原点からの横位置。
- `blockStart`: 同じ原点からの縦位置。
- `inlineSize`: border幅。
- `blockSize`: border高さ。

pixel丸め前の有理数・区分線形式で比較します。media/containerの条件領域を保存して
前後を交差させます。一部の画面幅で一致しても成功にならず、一点だけの消失や
600〜600.5pxだけの移動も検出します。公差を与えて成功へ緩めるAPIはありません。

Gridのtrack開始位置、gap、padding、border、入れ子、明示absoluteのactual containing
blockのpadding原点を考慮します。既存のabsolute用 `origin` は局所座標のまま保持し、
root基準の矩形は別の `rect` factとして記録します。

## Unknownと保証の前提

前後とも既存のfit検査がverifiedで、両軸を検査できることが前提です。viewport領域と
host/platform条件が異なる場合はUnknownにします。片方だけの共通部分を切り出して
成功にすることはありません。

汎用APIの初版は一状態につき具体的な一つの構造・platform caseに限定します。複数の状態候補を
まとめたreport同士を渡すとUnknownです。adapterは必要な状態遷移を列挙し、それぞれを
検査する必要があります。その列挙がUIのすべての遷移を覆うことは、このAPIだけでは
証明しません。Isleの宣言用adapterは、前述の有限な全候補の比較をこのAPI上で実行します。

対象のpathが不明、見えているboxの矩形が欠落、scroll/clipやsubgridの未対応座標系、
transform等の未対応CSS、solver失敗・timeoutはUnknownです。矩形の被覆を先に検査し、
不足を等価とみなすことを防ぎます。profile外のモデルや不正な入力、上限超過の例外も
厳格なビルドでは失敗にします。

root原点・viewport・host割当・スクロール位置が前後で同じことを前提とします。内容や
フォントの寸法を外部から与えた場合は、引き続きtrustedな前提です。CSSのアニメーション、
非同期処理中の中間frame、glyphやpaintの変化をこの二状態の比較で保証しません。
ブラウザーのCLS値が0になる証明とは区別します。

## 再現と評価

`just noshift-check` は、単体・CLI・Viteの検査と[汎用API九例・selector宣言五例・DOM注釈七例・key対応八例](../evals/scenarios/layout-transitions/README.md)を
ブラウザーなしで実行します。反例にはtarget・field・前後の値・差分の有理数とviewportを残します。

`just noshift-oracle` は、検査器の意味論を確かめる補助として、同じDOMのCSSを切り替えて
Chromiumの実際の矩形を三つの幅で比較します。これは静的証明を決定する手続きに含めません。
