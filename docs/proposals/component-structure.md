# Componentの構造・宣言の整理案

Status: proposal。以下の`const`と`view`は未実装。SafeGridに加え、PositionedGrid/space/overlayの初版は現行のbare template構文で実装済み。

componentを、入力、レイアウト契約、値の宣言、操作、表示とCSS実装の順で読めるようにする。トップレベルは宣言のためのDSLで、任意のTypeScript文を順番に実行する場所にはしない。式・型・テンプレート属性の既存の意味は保つ。

```isle
client component Counter(initial: number) {
  const step = 1;
  state count = initial;
  derive doubled = count * 2;

  event increment(e: EventSnapshot<MouseEvent>) {
    count += step;
  }

  view {
    <section>
      <output>{count} / {doubled}</output>
      <button type="button" on:click={increment}>Increment</button>
    </section>
  }
}
```

## 宣言の役割

| 記述 | 役割 | 参照できる値 | 更新 |
|---|---|---|---|
| componentの名前付き引数 | 外から渡すreadonlyなprops | 呼び出し側の式 | owner内からは不可 |
| `layout` | 親から必要とする領域と、実装が満たす保証 | 両軸の割当区間と検査profile | build-only |
| `const` | readonlyな入力から決まる固定値 | props、他のconst | 不可 |
| `state` | ownerが所有する変更可能な値 | 初期化式の既存ルールを維持し、const参照も認める | event / receiveから可能 |
| `derive` | 依存する値に追従する純粋な計算 | props、const、state、他のderive | 代入不可 |
| `resource` | 非同期の結果を受け取る境界 | 明示したkeyと型付きのreceive | 既存のowner・世代・採用順を維持 |
| `event` | 操作によるstate遷移の名前付き入口 | ownerの値と明示した引数 | stateのみ |
| `view` | 表示テンプレート | ownerの値とcontrol内のローカル値 | 宣言・代入不可 |

`const`はTypeScriptと同じようにbindingの再代入を禁止する。その上でこのDSLの値はimmutableな閉じたデータに制約する。`const`からstateやderiveを参照する記述は拒否し、更新に追従させたい計算は`derive`で明示する。propsに依存するconstはビルド時のliteralとは限らず、readonlyな入力から決まる値である。

```isle
const step = 1;
const baseline = initial * 2;  // readonlyなpropsを参照
state count = baseline;
derive total = count + step;
```

const同士の循環は拒否する。既存のderiveの循環検査、閉じた型・純粋な式の検査を共有する。componentを呼び出すたびに任意のトップレベル処理を実行する仕組みは導入しない。

## Componentの境界

- propsは既存の名前付き引数へ統一する。`props`のobjectと分割代入を二重に書かない。
- `component` / `client component` / `server component`の区分を維持する。sideを使用箇所から推測しない。
- `view`はcomponent内に1つ置き、最後に書く。中には既存のnative rootと`Show` / `For`などのcontrolを置く。view自体はDOM要素もruntime ownerも作らない。
- レイアウト契約は`layout`へ、実際のCSSは`view`内の`<style>`へ置く。既存のscoping・略記検査・CSS抽出を共有する。
- `event`の明示引数、`on:click`属性、同期キャンセルの表記は維持する。resourceの受信型や世代制御も今回の変更とは分離する。

layout・const・state・derive・操作を上記の順で並べることは推奨するが、単なる見た目の順序を言語の制約にはしない。値の参照・初期化・循環の規則を別に定義する。viewの後ろには宣言を置かない。

## CSSの制約を含む標準形

契約と実装を別に書く。`layout`には必要な領域と保証を宣言し、その後に状態や操作、最後に`view`とCSSを置く。`layout`はCSSを自動設定する指定ではない。

```isle
component FourCells() {
  layout SafeGrid {
    requires {
      inline-size: 160px..640px;
      block-size: 40px..640px;
    }
    ensures {
      overflow-inline: fit;
      overflow-block: fit;
    }
  }

  view {
    <main class="row" aria-label="Four checked cells">
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .row {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          grid-auto-rows: 40px;
        }
        .cell { min-inline-size: 40px; block-size: 40px; }
      </style>
      <div class="cell" /><div class="cell" />
      <div class="cell" /><div class="cell" />
    </main>
  }
}
```

`requires`は親からの割当領域、`ensures`はその領域で実装が満たす保証。`SafeGrid`は既存の閉じたprofileで、Grid、in-flow、実際のborder-box、対応する両軸のgeometryを要求する。floatは拒否する。任意のprofile・述語やCSSの別言語は導入しない。

この例ではgap・親のpadding/borderが0なので、横方向に40px×4＝160pxが必要になる。`column-gap: 8px`を加えれば184pxが必要で、160pxから使えるという契約のままでは失敗する。`box-sizing: border-box`を契約だけで仮定せず、実際のresetとcascadeから確認する。

viewのwrapperだけを取り除いた現行文法の対応版を使い、既存のlayout解析とZ3で、この例と以下の境界値を検査する。新しいview構文が既に動くという意味ではない。

### 親子・レスポンシブを一緒に検査する

- 親のGridが子へ渡すallocated領域を、子のrequiresと照合する。親が160pxを受け取っていても、padding等で各子の割当が40px未満なら成功にしない。
- media queryはviewport、container queryは適格な祖先のcontent boxに対する条件として扱う。component自身を暗黙のquery containerにはしない。
- 対応する条件の到達可能な組み合わせと境界を検査し、幅のサンプリングを保証の代わりにはしない。
- 例を80pxから使う場合、`width < 160px`の領域では2列へ切り替える。2行で80pxの高さが必要になるため、block-sizeの要求も80pxへ見直す。
- `width < 159px`で切り替える実装では、幅159px以上160px未満に4列が残る。小数幅を含むこの区間も拒否する。
- `For`の有限な件数・分岐・class候補を考慮する。件数や内容の上界がわからない場合は、Unknownを返し、初期表示だけの検査で成功扱いにしない。
- subgridは親のtrack・span・gap・insetを引き継いで照合する。未対応のintrinsic sizing等はUnknownのままにする。

mediaの160pxという境界を、親のpaddingや外側の配置が異なるcomponentへそのまま流用できるわけではない。適切な祖先containerを所有してqueryするか、配布環境も含めて条件を検査する。

### Overflow・折返し・reset

| 項目 | component案での扱い |
|---|---|
| float / Grid | SafeGridのprofile制約。実CSSが従うことを検査する |
| box-sizing / reset | 実CSSと所有するresetのcascadeを検査。layout宣言でCSSを補わない |
| text wrapping | 実CSSのwhite-space / overflow-wrap等と、内容/fontの寸法前提を区別する。任意のtext寸法は自動的に保証しない |
| overflow | 現行SafeGridの宣言保証は両軸fit。scroll/clipへ緩める新しい宣言は今回追加しない |
| scrollbar | 検査対象とするnative profileの占有寸法を配布環境へ明示する。任意のOS/zoomの寸法を仮定しない |
| CSS shorthand | 同一ルール内の略記とlonghandが干渉したら拒否。別ルールの意図的なcascadeは、最終値をlayout検査へ渡す |

例えば`padding: 0; padding-left: 8px;`を同じルールへ書くと、[既存の略記干渉検査](../css-shorthands.md)で拒否する。順序や同値な指定による例外は作らない。reset→componentの別ルールによる上書きは許可し、その結果のcontent boxを検査する。

layout解析APIにはfit/scroll/clip等の方針もあるが、[SafeGrid契約の初版](../layout-contract-language.md)が受け付ける保証はfitだけである。`ensures { overflow-block: scroll; }`のような未対応構文を実装済みとして例示しない。将来の拡張では、スクロール領域の許可、子の収まり、scrollbar占有幅を別々に定義する。

### 検査の責任と結果

```text
component + CSS + 実際のreset/配布環境
  → 独立した配置モデルの抽出
  → 親からの割当とrequiresの照合
  → 保証違反の反例検査（Z3）
  → verified / violated / unknown
```

CSS由来のLayoutIRへensuresを仮定として入れない。ContractIR・LayoutIR・ObligationIRの分離を維持する。親の割当がrequiresを満たさない場合も、不都合な入力を除外して成功扱いにしない。

所有するCSS、resetの順序、配布viewport、text/fontのbounds、scrollbar profileは環境として別に扱う。component内のrequiresだけで環境が満たされるとは見なさない。未解決の外部CSS・geometry・solver timeout等はUnknownで、厳格なbuild gateでは失敗とする。任意のbrowser全体を証明する契約ではない。

通常の`compile`は文法・型・CSS略記等を検査する。layout/Z3の適合性はproduction build、CLIのlayoutコマンド、playgroundのlayout検査で扱う。契約・solver・証明用metadataを最終runtimeへ追加せず、CSSは既存のscoping・抽出・配信経路を使う。

### 地図・SDK境界の扱い

地図全体へSafeGridを付けるだけで検証済みにはしない。現行の厳格な配布検査は閉じたdocumentを要求し、resource adapter・外部DOM変更・widget等を受け付けない。Canvasや詳細DOMをadapterが所有する地図は、この境界に該当する。

契約を新しいcomponent構造へ置くことと、opaque DOMを含む保証範囲を広げることは分ける。将来はadapterが使える領域と変更できるDOMを明示し、静的に所有する部分と接続する必要がある。検査対象外の領域を黙って無視してVerifiedにはしない。

## 絶対配置への拡張

`SafeGrid`のin-flow契約を保ったまま、別profileの[PositionedGrid初版](positioned-layout.md)を追加した。名前付きのpadding-box座標空間と、そこへ配置するoverlayをlayout宣言に持たせる。

```isle
layout PositionedGrid {
  requires { inline-size: 320px..960px; block-size: 240px..720px; }
  space map = ".map";
  overlay ".controls" within map;
  ensures { overflow-inline: fit; overflow-block: fit; }
}
```

この契約構文の初版は実装済み。実CSSのcontaining blockが宣言spaceに一致すること、offsetと使用寸法から求めた矩形が収まること、peer overlayが重ならないことを検査する。親のGrid track計算からabsoluteを外し、content boxとpadding boxの座標を区別する。CSSの基準が途中の親・transform等で変わるケースを、暗黙に見逃さない。

評価は`just component-proposal-check`で再実行できる。[現行SafeGridの9シナリオ](../../evals/results/component-structure/layout.json)と[手書きのabsolute矩形モデル＋Chromium照合](../../evals/results/component-structure/positioned.json)を分けて記録する。後者を、新profileのコンパイラ実装が動作するという根拠にはしない。

## 地図での変更点

```isle
client component Explorer() {
  const categories: Category[] = [
    {id: "all", label: "Explore all"},
    {id: "cafe", label: "Coffee"},
    {id: "park", label: "Parks"}
  ];

  state query = "";
  state category = "all";
  // 他のstate、derive、resource、eventはそれぞれ宣言する。

  view {
    <main>
      <!-- 既存の検索・地図・結果一覧のテンプレート -->
    </main>
  }
}
```

固定のカテゴリ一覧がstateに見える問題と、宣言の直後から突然JSXが始まる問題を解消する。resourceの入力fieldからstateへ代入する冗長さ、状態表示の長い三項演算子、adapterの手動型付けは、今回とは別の課題として残す。

## 実装時の確認事項

1. typedなconst配列・recordにcontextual typingを適用する。現状はtyped deriveのrecord配列にも不足があり、固定値をstateへ置く回避が残っている。
2. constをreadonlyな式グラフへ、viewを既存のtemplate rootへ落とす。source位置を診断に残し、新しいruntimeの分岐やwrapperを加えない。
3. universal componentへ展開したconstは、readonlyなpropsを通して呼び出し元の値に対応する。独立したclient ownerのpropsは既存どおり不変である。この区別を入れ子の検査に含める。
4. Node/browser両compiler、SSR-only、resource、CSS/layout、source位置、unused warningを検査する。layout契約とview内CSSの対応、reset、親子の割当、media/container境界、Unknownによる失敗も維持する。
5. Counterと地図の新旧表記について、HTMLと動的更新の対応、snapshot・チャンクの差を評価する。カテゴリ一覧の扱いによる最適化差は、構文追加自体のruntime costと分ける。
6. 当初は裸のテンプレートを互換入力として扱い、ドキュメントとplaygroundの標準をviewへ寄せる。全examplesの移行・旧表記の削除は別の変更として扱う。

PositionedGridの実装検査は`just positioned-layout-check`。[実コンパイラとChromiumの評価](../../evals/results/positioned-layout/report.json)は、手書きモデルの評価と別に記録する。
