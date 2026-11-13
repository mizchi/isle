# 絶対配置と座標空間の拡張案

状態: 初版を実装。`PositionedGrid`、`space`、`overlay`をNode/browserのコンパイラ、CSS抽出、Z3、Vite配布検査へ接続した。既存の`SafeGrid`はin-flowのまま維持する。[component全体の案](component-structure.md)の`const` / `view`は引き続き未実装。

## 標準形

```isle
component MapOverlay() {
  layout PositionedGrid {
    requires {
      inline-size: 320px..960px;
      block-size: 240px..720px;
    }
    space map = ".map";
    overlay ".controls" within map;
    ensures {
      overflow-inline: fit;
      overflow-block: fit;
    }
  }

  <section class="map">
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      .map {
        position: relative;
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        grid-template-rows: minmax(0, 1fr);
        block-size: 240px;
        padding: 16px;
        border: 2px solid #345;
      }
      .surface { min-inline-size: 0; min-block-size: 0; }
      .controls {
        position: absolute;
        inset-inline-end: 16px;
        inset-block-end: 16px;
        inline-size: 40px;
        block-size: 40px;
      }
    </style>
    <div class="surface" />
    <div class="controls" />
  </section>
}
```

`space map`は、componentが所有する`.map`を期待する座標空間として命名する。`overlay`は`.controls`の実際のcontaining blockがその空間であり、boxがその内側へ収まることを要求する。宣言はpositionや座標を生成・上書きしない。配置は標準CSSが行い、契約はその適合を調べる。

spaceのselectorは各到達caseで一意な所有boxへ解決し、overlayのselectorは有限の所有boxへ対応付ける。componentの外側を暗黙の座標基準にしたり、どこにも対応しないselectorで検査を空にしたりしない。中間のancestorへ`position:relative`を追加して実際の基準が変われば、期待するspaceとの不一致を検出する。

## CSSとの対応

通常のabsolute containing blockは、基準となる祖先のpadding edgeで作られる。insetの百分率は対応する軸のcontaining block寸法に対する値になる。[CSS Positioned Layout §2.1・§3.1](https://www.w3.org/TR/css-position-3/#def-cb)

Gridではgrid-placement指定がcontaining blockをgrid areaへ変える場合がある。autoの場合のpadding edgeと区別し、absoluteの子を通常のGrid trackの配置・寸法寄与へ含めない。[CSS Grid §10](https://www.w3.org/TR/css-grid-2/#abspos)

したがって初版では、宣言したrelative boxのpadding boxを基準にする。absolute子のgrid-placementはautoに制限する。transform等で別の基準が作られる場合を無視しない。transformがcontaining blockを作る点は[CSS Transforms §3](https://www.w3.org/TR/css-transforms-1/#transform-rendering)にも定義されている。

## 座標モデル

初版はhorizontal-tb/ltr、非scrolling、margin 0、transformなしのboxに限定する。基準のpadding boxを`W × H`、overlayの**used border-box**を`w × h`、その原点を`x, y`とする。

```text
startから配置: x = startInset
endから配置:   x = W - endInset - w
block方向も同様

fit := 0 <= x AND x + w <= W
   AND 0 <= y AND y + h <= H
```

親border-boxの画面原点を`P`、border-startを`b`とすると、非変形の局所座標の原点は`P + b`。paddingは空間に含む。content boxの原点`P + b + padding`と混同しない。現在のIRはactual containing blockのpath・padding寸法と局所原点を記録する。入れ子のglobal原点への合成、viewport/client座標、document/page座標への変換は未実装。

上のCSSで親border-boxが320×240、borderが各2pxなら、基準は316×236。右・下16px、overlayが40×40なら、局所原点は260,180、親border原点からは262,182になる。左右16pxのpaddingをもう一度差し引く計算にはしない。

`w,h`は指定したwidth/height文字列そのものではなく、box-sizing・padding/border・解決済みのmin/maxを反映した使用寸法。確定できないintrinsic sizeを、都合のよい固定値に置き換えない。

## 最初の対応範囲

- Gridでin-flow部分を決め、その後にabsolute部分を配置する。absoluteを親のauto heightやGridの最小track寸法の根拠にはしない。
- 親の両軸をabsolute子に依存せず確定できることを要求する。rootだけがabsolute子を持ち、高さが未確定なケースは成功にしない。
- 各軸でstartかendの一方と、使用寸法を決定できることを要求する。両側autoのstatic position、auto margin、過剰な指定の解決は初版では扱わない。
- insetはpx・固定百分率・加減算だけのcalcをaffine式として扱う。inline/block-sizeは両軸とも明示したpxまたは百分率とする。既存解析器のmin/max制約も引き継ぐ。幅用と高さ用の百分率の基準を分ける。
- relativeな基準boxはゼロoffset。非ゼロのrelative移動、transform/translate/rotate/scale、filter/backdrop-filter、perspective、will-change、contain等の基準・描画への影響をモデル化できない値はUnknownにする。
- fixed/sticky、replaced element、scrolling containing block、absoluteのgrid-area指定とsubgridとの組合せは、個別の意味を追加するまで対象外。
- container queryのcontent-box基準とabsoluteのpadding-box基準を別に解決する。query containerを自動的にpositioned containing blockと同一視しない。基準が曖昧になる組合せを推測で通さない。
- media/container条件と有限のstate/Show/For候補ごとに座標・基準・サイズを解決し、全caseで義務を検査する。

absolute boxの割当は、Grid itemのtrack割当とは別にCSSから解決したused border rectangleと定義する。親の明示的なoverlayと子のsource契約がそろった公開rootへ接続できる。詳細は[親子契約の仕様](../layout-contract-language.md#子componentの公開rootとprivateな座標系)を参照。

## 重なりの扱い

overlay宣言は、指定space内のin-flow内容との重なりを許可する意図を表す。異なるoverlay同士は、同時に存在する場合、初版では正の面積で重ならないことも要求する。

```text
disjoint(A,B) := A.right <= B.left OR B.right <= A.left
             OR A.bottom <= B.top OR B.bottom <= A.top
```

意図的に重なる複数marker等を扱うには、将来その許可を別の契約で明示する。既存のSafeGridの重なり検査を黙って弱めない。

包含と非重複は、z-indexやstacking context、影・ink overflow、背後のbuttonを隠さないこと、focusやhit testingの保証とは別。検査していない性質をVerifiedの意味へ混ぜない。

## 検査IRへの追加

- **LayoutIR**：boxの局所原点、border/content/padding各矩形、実際のcontaining-block参照、その成立条件を追加する。CSSから独立に抽出する。
- **ContractIR**：期待するspace/overlayのbindingと、包含・非重複の要求を持つ。
- **ObligationIR**：期待と実際の基準の一致、各矩形の包含、peer overlayの非重複、caseの被覆を照合する。

反例は対象path、viewport、違反codeを示し、寸法比較の違反では軸・available/requiredも記録する。局所座標とactual containing blockはLayoutIRから読める。space名・期待/実際の基準をまとめた専用診断UIは後続で追加する。契約をモデルの仮定にして反例を消さない。未知の基準・サイズ・外部CSSはUnknownとして厳格なbuildを失敗させる。

初版の式は有理数の区分線形式へ落とし、既存のZ3 QF_LRAモデルと接続できる。`x * zoom`のような変数同士の積を、affineと偽って扱わない。動的marker座標は、後続で型付きの座標入力・range解析・CSS clamp等と結び付ける。座標が単なるnumberだからboundedだとは扱わない。

## 既存の地図との境界

まず地図の枠と固定サイズのcontrols等を、Grid＋overlayとして検査できるようにする。Canvas描画、外部SDKのDOM変更、未知の内容からauto sizeになる詳細cardまで、この追加だけで証明できるわけではない。opaque領域の所有・寸法・変更権限の契約は別に必要となる。

制約と座標IRはbuild-only。実際の配置はCSSに任せ、通常runtimeへ座標監視・再配置処理・solverを追加しない。

## 検証の境界

1. 手書きの局所矩形モデルで包含・非重複のSAT/UNSATを調べる。
2. 対応する標準CSSをChromiumで描画し、padding原点、端からの配置、百分率、containing blockの変更を照合する。
3. その後、独立したCSS抽出器・新しいprofile文法・契約bindingを実装して同じcaseへ接続する。

最初の2段階は仕様案の限定的な照合で、コンパイラ対応や全browserの証明ではない。browserの画素丸めや外側hostの影響の前提も結果に残す。

### 実行した限定モデル

[評価コード](../../evals/scenarios/component-structure/check-positioned.mjs)は手書きの矩形モデルと[標準CSSのfixture](../../evals/scenarios/component-structure/positioned.html)を照合する。Z3へは保証違反の存在を問い合わせるため、UNSATはモデル内で違反なし、SATは反例ありを意味する。空の入力領域でUNSATにしないため、領域自体の到達可能性も確認する。SATの反例寸法はChromiumでも再現する。

| case | 期待する結果 |
|---|---|
| startから16px/24px、endから16px | モデル内で包含を満たし、browserの局所座標と一致 |
| left/topが25% | padding-boxの各軸が基準。320×240のborder-boxでは局所79,59 |
| leftが100%−20pxで幅40px | 右端へ20pxはみ出す反例を再現 |
| leftが−8px | 左端からはみ出す反例を再現 |
| 中間のrelativeな親 | 領域に収まっていても、実際の基準がmapからframeへ変わる |
| 左右各16px、幅40pxのpeer overlay | 親border-boxが116px以上なら接触まで。115.5pxでは0.5px重なる |

現在の[結果](../../evals/results/component-structure/positioned.json)は9ケース（包含5、基準変更1、peerの最小幅3）。固定寸法・無変形の局所モデルであり、独立したCSS抽出器や新profileの実装を検証した結果ではない。fixtureの見た目は[vlmkitのintegrity gate](../../evals/results/component-structure/positioned-integrity.json)でも確認し、画像は375px/1280pxで保存する。

[375px](../../evals/results/component-structure/positioned-375.png)と[1280px](../../evals/results/component-structure/positioned-1280.png)の画像を目視した。見出し、基準を示す枠、右下のcontrol、寸法の説明が表示され、controlのはみ出しや説明textとの衝突はない。これはfixtureの確認で、地図アプリ全体の視覚検証ではない。

既存のSafeGrid検査とまとめて再実行するには`just component-proposal-check`を使う。

## コンパイラ実装の検証

[実行できるソース](../../examples/layout-contracts/positioned.isle)は現行のbare template構文で書く。`node tools/isle.mjs layout examples/layout-contracts/positioned.isle`で検査でき、playgroundの **Absolute layout · named coordinate space** presetも同じソースを使う。

`just positioned-layout-check`は契約・geometry・Viteの配布検査、実コンパイルしたHTMLの4幅での座標照合、browser WorkerのZ3 Wasm検査、vlmkit integrityを実行する。[評価コード](../../evals/scenarios/positioned-layout/check.mjs)と[結果](../../evals/results/positioned-layout/report.json)は、上の手書きモデルの評価とは分離する。

初版では、各spaceは到達caseごとに一意なrelative boxへ対応する。overlayのselectorは有限な到達caseの少なくとも一つで所有要素へ対応すればよく、Showやdisplay:noneで消えるcaseには配置を作らない。宣言していないabsolute、同じboxへの複数overlay宣言、non-absoluteな対象、selector誤記は失敗する。スクロール・clipを持つ途中の祖先やsubgridの基準boxはUnknown。子componentへは明示的な公開root境界として接続し、privateな座標系は子の契約で再帰的に検査する。未宣言の境界はUnknown。

HTMLとresume用モジュールは、layout宣言を外した場合と同一であることを検査する。SSR-onlyのVite buildではJS/Wasm chunkが0個であることも確認する。生成アプリへのsolver追加はない。

親子構成は[専用の例](../../examples/layout-contracts/positioned-components.isle)と`just positioned-components-check`で確認できる。[評価結果](../../evals/results/positioned-components/report.json)では、割当・CB寸法・依存する子契約・呼出し元のplacement transferを記録する。
