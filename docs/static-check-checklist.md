# CSS × DOM 静的検査の実装チェックリスト

`docs/layout-checking.md` に書いた検査の、次に足すものの一覧。上から順に進め、1 項目ごとに TDD(ユニットテストを先に書く)、
3 つのブラウザー(Chromium・Firefox・WebKit)での照合、Chromium の layout e2e と component-lint 評価の確認をしてから push する。
どの項目も、決められないところは Unknown に残す(成功にしない)。

印: `[ ]` 未着手、`[~]` 一部済み、`[x]` 済み。

## A. アニメーションと CLS

- [x] **A1. `@starting-style` の配置の開始値と、現れるときのトランジション**: いまは Unknown。開始値から落ち着いた値への
  トランジションを、キーフレーム 2 つのアニメーションとして既存のシフト検査(easing の極値を含む)に通す。
  照合: 毎フレームの位置と報告の一致(3 ブラウザー)。
- [x] **A2. `animation-delay` と `animation-fill-mode`**: いまは読み捨てている。`forwards`/`both` は終わりの戻り(endJump)を
  消し、`backwards`/`both` と遅延は始まりの飛びの時刻を変える。スコア上限を正確にする(いまは大きめ)。
- [x] **A3. `animation-timeline: scroll()` / `view()`(スクロール連動)**: いまは Unknown。スクロールは CLS の「直前の入力」に
  入らないので、配置を変えるならシフトになる。進み具合 0〜1 の全体を通るアニメーションとして調べる(時間の上限は使わない)。
- [x] **A4. 区間や easing の違う複数プロパティの行き過ぎ**: いまは Unknown。各プロパティの極値の時刻 t を求め(x(s) を
  解く)、その時刻のほかのプロパティの値を外側に丸めて組み合わせる。
- [x] **A5. 単位の混ざる行き過ぎ(px ↔ %)**: `calc()` で補間できる配置に限って扱う。px と %・vw・vh の間は、単位ごとの量を別々に
  補間した `calc()`(負になれないプロパティで量が負なら `max(0px, …)`)を極値のフレームに置く。D2 で block flow の `%` の高さが
  解けるようになったので、高さの行き過ぎで下の箱が動くのを報告できる。3 つのブラウザーで、1ms ごとの高さが極値の範囲に入り、
  0.25px 以内で届くことを確かめた。flex の項目の幅の `max(0px, calc(…))` も D2 で解けるようになった。

## B. transform

- [x] **B1. 奥行きのない 3D の書き方**: `translateZ(0)`・`translate3d(x, y, 0)`・`scale3d(x, y, 1)`・`rotateZ()`・
  `rotate: z 90deg` は、`perspective` がなければ 2D と同じ。GPU 合成のための `translateZ(0)` はよく使われるのに Unknown になる。
- [x] **B2. 90° 単位でない回転とほかの transform の組み合わせ**: 合成した写像の外接矩形で、accessibility の検査だけで扱う
  (単独の任意角と同じ扱い)。
- [x] **B3. `transform-origin`(中心以外)**: いまは Unknown。原点を移した合成として扱う。

## C. カスケードと at-rule

- [x] **C1. `@supports` の判定表を広げる**: よく使う機能(`aspect-ratio`、`inset`、`color-mix()`、`:has()` 以外のセレクター、
  `text-wrap: pretty`、`field-sizing` など)を、3 ブラウザーの `CSS.supports()` で確かめて足す。
- [x] **C2. `@scope` の中の `:scope` と `&`**: `:scope` は根そのもの、`&` は `:where(:scope)`(詳細度 0。最初は根のセレクターの詳細度と読み違えていた。3 つのブラウザーで測って直した)。
- [x] **C3. 入れ子の `&` で、結合子を含む親が先頭以外にある場合**: セレクターの `:is()` に結合子を許す(いまは不可)。
- [x] **C4. `revert-layer`**: ひとつ前のレイヤーまでの値に戻す(層に入っていない規則では明示した層に戻る)。

## D. 配置のモデル

- [x] **D1. 0 以外のオフセットを持つ `position: relative`**(px。`%` と rtl の横のオフセットは残り): いまは Unknown(「Relative positioning spaces require zero
  offsets」)。箱だけが動くので、配置はそのままで、描画の位置をずらす。
- [x] **D2. flex の項目の `%` 幅と、`vw`・`em` の長さ**: `em` の長さと、縮まない(か min-width のある)flex の項目の `%` の幅は済み。
  block flow の中の `%` の高さ(親が高さを宣言しているとき。px でも vh でもよく、min/max で詰めたあとの内容の高さに対して)と、
  その高さでの px と % を混ぜた `calc()` も済み(3 つのブラウザーで、2 つの viewport の高さで位置と高さが一致)。
  flex の項目の `vw` の幅と `calc()`(px・%・vw・vh の和)の幅や basis も済み: `%` の basis と同じく、容器の内容の幅に対する
  viewport の式として解く(縮まないか、伸びるだけの場合。縮む項目どうしの重みが 1 つの幅の割合にならない場合は Unknown)。
  3 つのブラウザーで、2 つの viewport の幅で一致。grid の `%` の列・行と `%` の gap も、その軸の容器の大きさが 1 つの定数のとき
  (px の幅、宣言した px の高さ)は px に書き換えて解く。flex の column の項目の `%` の高さ・basis・min-height も、column の
  宣言した高さが定数なら同じく解く。viewport で変わる容器の `%` のトラック、
  高さが決まる flex・grid の項目(高さを宣言した 1 行の row で伸ばされる、高さを宣言した column で伸び縮みする、grid の領域に
  伸ばされる)の中の `%` の高さも、その高さに対して解く(3 つのブラウザーで一致。標準モードで測る。quirks モードの WebKit は auto に
  した)。flex の項目の `min()`・`max()`・`clamp()` の幅と basis も、区間ごとに分けて解く(A5 の `max(0px, calc(…))` の行き過ぎも
  これで解ける)。伸ばされない(align-self: start などの)grid・row の flex の項目の中の `%` の高さは auto になる(3 つのブラウザーで
  測った)ので、block の中の block と同じく `W_LAYOUT_DECLARATION_INERT` を出して auto として解く。
- [x] **D3. inline の中の行の配置**: 文字の行と inline の箱の位置。大きい。
  最初の一歩として、測った文字の中の inline の箱(`inlineBounds`)を `text-align: center`・`right`・`end` でも出す(以前は start と
  left だけ)。行の幅の区間で外接・内接をずらし、改行が揺れる幅は除く(ADR-0013)。3 つのブラウザーで一致。
  **誤りの修正**: inline の箱の上下の padding は行を動かさないが箱(描画と hit test)を上下に広げる(19px のリンクが 27px になる)のに、
  矩形に入れていなかった(覆いや focus の隠れの判定が甘くなる)。上下の padding だけ矩形を広げる。`vertical-align` が baseline・top・
  bottom 以外(super、sub、middle、text-top、長さ、%)の inline の箱は、行を高くする(24px → 29px など、ブラウザーで量が違う)のに、
  測った文字の高さのまま Verified にしていた。Unknown にする。`text-align: justify` は最後の行(1 行の文字列ではその行)が start に
  揃うので、そこに載る inline の箱の矩形を出す(前の行は単語の間が伸びるので出さない。Chromium で確認。折り返しの位置は
  ADR-0010 のとおり Chromium に合わせてあり、Firefox はこの文で別の幅で改行した)。inline の箱の左右の padding・border・margin は、
  一行の文字列で text 契約に `inline: {'.u': {text, edges: [margin-left, border+padding-left, border+padding-right, margin-right]}}`
  と測らせれば、行の幅に足し、後ろの箱をずらす(engine は CSS の値が契約と一致するときだけ受け入れる。Chromium・WebKit で一致、
  Firefox は 1/60px の丸めで 3/1000px ずれる)。同じ family・大きさで太さだけ違う inline の箱(`<strong>` など)は、一行の文字列で
  `inline: {'.u': {text, weight}}` と測らせれば、行を太さごとの run の和として測る(Chromium で日本語・Latin、Firefox・WebKit で
  Latin が一致)。大きさや family の違う inline は Unknown のまま(行が高くなりうる)。**誤りの修正**: 文字の中の画像・svg・
  フォーム部品などの置換要素(atomic inline)は、自分の幅だけ行を広げ、文字の ascent より高ければ行を高くする(24px の行に 40px の
  画像で Chromium 47px、Firefox・WebKit 46.5px)のに、文字の大きさのまま Verified にしていた。U_LAYOUT_INLINE にする(横に並べるなら flex・grid の項目にする)。
  一行の文字列で `inline: {'.i': {atomic: [幅, 高さ], at: 前の文字数}}` と測らせた画像・アイコンは、行の幅に足し、後ろの文字と箱を
  ずらし、baseline に置いた矩形を出す。行を高くしない高さ(baseline までの高さ以下。Chromium は 17px、Firefox・WebKit は 17.5px:
  ブラウザーで丸めが違うので小さい方)に限る(それより高いと行の高さがブラウザーごとに違う: 40px で Chromium 47px、ほか 46.5px)。
  engine は CSS の大きさが契約と同じで、端がなく、baseline に置かれるときだけ受け入れる。3 つのブラウザーで一致。
  rtl: ヘブライ文字と空白だけの文字列(見た目の順が論理順の逆になるだけで、bidi の並べ替えがない)は、`direction: rtl` で行の右端から
  鏡に映した矩形を出す(start = 右、center、end = 左。一行と折り返し。Chromium で確認。右から左の単語ごとの丸めを inline の端の
  誤差にも足した)。ラテン文字・数字・句読点を混ぜた rtl の文字列は矩形を出さない(bidi の並べ替えは測らない)。
  折り返す文字列の inline の箱の左右の端も、端を箱の最初と最後の文字に足して改行を求める(行数の profile、min-content、改行の位置、
  行の幅のすべてに入る)。Chromium・WebKit で 120〜900px の行数と矩形が一致。
  折り返す文字列の太さの違う inline の箱も、太さの run を shaping の run として分けて改行を求め、行ごとに run の和で位置を出す
  (行が太さの run を切る行には矩形を出さない)。Chromium・WebKit で行数と矩形が一致。
  折り返す文字列の画像・アイコンも、U+FFFC の置き場所として改行を求める(3 つのブラウザーとも、空白がなくても画像の前後で改行できた:
  前後を改行の機会にし、幅は追加の advance、shaping からは除く)。Chromium・WebKit で行数と矩形が一致。
  意図して Unknown のまま残すもの: 行を高くする画像(行の高さがブラウザーごとに違う)、bidi の混ざった rtl の文字列(並べ替えを
  測らない)、大きさや family の違う inline。

## E. 新しい警告のパターン

- [x] **E1. スクロールバーの出現によるシフト**(`W_LAYOUT_SCROLLBAR_SHIFT`): 内容の高さが viewport を超えうるのに
  `scrollbar-gutter: stable` も `overflow-y: scroll` もないページは、通常のスクロールバーの環境で、超えた瞬間に幅が変わる。
  解析の報告に `pageScroll`(viewport に収まる場合があるか、超える場合があるか、html が溝を保つか)を出し、
  adapter-core が状態の間で比べる。ある状態では収まり別の状態では超えるとき警告する(viewport の大きさを変えたときの変化は、
  利用者の操作なので報告しない)。`overflow: hidden` はスクロールバーを出さないので対象外。Chromium の通常のスクロールバーで、
  body の幅が変わるところと警告が一致することを確かめた(`html` の `clientWidth` は stable でもスクロールバーが出るまで溝を含むので、
  箱の幅で比べる)。
- [x] **E2. 同じ規則の中で、一括指定が先に書いた個別指定を上書きする**(`padding-top: 10px; padding: 0`)ので、個別指定が効かない。**既存の `E_CSS_SHORTHAND_CONFLICT` が、同じ規則の中の一括指定と個別指定を順番によらず報告していた**(新しく作る必要はなかった)。
- [x] **E3. `text-wrap: balance` の行数の上限**: Chromium と Firefox は 6 行を超える段落では揃えない(WebKit は長くても揃える)。長さの上限のない動的な文に付けた場合を `W_LAYOUT_BALANCE_LINES` で警告する。
- [x] **E4. `transition` が `prefers-reduced-motion: reduce` で止まらない長い動き**: アニメーションと同じく 5 秒を超える場合。
  `W_A11Y_TRANSITION_MOTION`。箱を動かすプロパティ(位置・大きさ・余白・transform、`all`)の transition だけを数え、色と opacity の
  変化は動きではないので除く。reduce の下で `transition: none` か 5 秒以下になれば報告しない。


## F. ブラウザーが受け入れるのに何もしない CSS

ブラウザーは文法として受け入れるが、効果のない書き方。打ち間違いや値の入れ違いで起きやすい。3 つのブラウザーで、警告が出るところで
宣言の効果がないことを確かめた(`e2e/layout-css-mistakes.spec.mjs`)。

- [x] **F1. `@keyframes` のないアニメーション名**(`W_CSS_KEYFRAMES_MISSING`): 名前は大文字小文字を区別する。並びの中の 1 つだけでも報告する。
- [x] **F2. 長さのないアニメーション**(`W_CSS_ANIMATION_NO_DURATION`): `animation: spin infinite` は 0s で、何も見えない。
  `fill-mode: forwards`・`both` の 0s(終わりの状態を当てる書き方)とスクロール連動は除く。
- [x] **F3. 値も代わりもない `var()`**(`W_CSS_VAR_INVALID`): 計算値の時点で無効になり、その宣言は unset(継承か初期値)になる。
  解析は以前から unset として扱っていた(`invalidSubstitutions`)が、警告にしていなかった。
- [x] **F4. min より小さい max**(`W_LAYOUT_MIN_ABOVE_MAX`): 大きさは max で詰めてから min に広げるので、いつも min になる(width や
  内容が効かない)。「max が効かない」のではない(width: 80px は max で詰められてから min の 50px になる。max がなければ 80px):
  最初にそう書いて測り、誤りに気付いた。
- [x] **F5. どの viewport にも当たらない `@media`**(`W_CSS_MEDIA_NEVER`): 下限が上限より上(`min-width: 900px` と
  `max-width: 600px`、`width > 600px` と `width < 600px`)。並びのどれかが当たりうるなら報告しない(`print` を含む)。
- [x] **F6. 同じ規則で 2 回書いたプロパティ**(`W_CSS_DUPLICATE_DECLARATION`): 前の宣言は効かない(後が勝つ。`!important` なら前が
  勝ち、後が効かない)。後の値が新しい関数・単位・キーワードやベンダー接頭辞(`100vh` のあとの `100dvh` など)なら、古い
  ブラウザーのための代わりの書き方なので報告しない。
- [x] **F7. 重ならない `z-index`**(`W_LAYOUT_DECLARATION_INERT`): position: static で flex・grid の項目でもない箱の `z-index` は
  重なりの順を変えない。3 つのブラウザーで、hit test の一番上の箱が警告と一致した(relative にするか、flex・grid の項目なら効く)。
- [x] **F8. auto(や none)と長さの間の transition**(`W_CSS_TRANSITION_AUTO`): `height: auto` から `:hover` の `100px` などは
  補間されず、箱は跳ぶ(3 つのブラウザーで測った。`interpolate-size: allow-keywords` で動くのは Chromium だけ)。`:hover`・`:focus`
  の値と比べ、コンポーネントの状態の間(クラスの切り替え)は adapter-core が状態ごとの値(`transitionSizes`)を比べる。
- [x] **F9. content のない `::before`・`::after`**(`W_CSS_PSEUDO_NO_CONTENT`): ほかのプロパティを書いても、content がなければ
  作られない。
- [x] **F11. 配置が Unknown でも報告する**: 配置の前に Unknown になる入力(配置を変える `:focus` の規則など)では、box ごとの警告(F2〜F4・
  F7・F8)が出なかった。配置が最後まで走らなかったときは、style だけを計算して木をたどり、同じ検査をする(F9 の擬似要素も)。
- [x] **F12. 長さのない transition**(`W_CSS_TRANSITION_NO_DURATION`): `transition: opacity` は 0s で、変化は一度に起きる。
  一括指定の各項目に時間がない場合と、`transition-property` だけで長さがない場合。明示した `0s` は意図とみなして報告しない。
- [x] **F13. 決まりすぎた絶対配置**(`W_LAYOUT_DECLARATION_INERT`): 両側の inset と大きさを全部書いた absolute・fixed の箱は、
  終わりの側(ltr では right、rtl では left、縦は bottom)が無視される(auto の margin があれば中央寄せに使われるので除く)。
  3 つのブラウザーで、無視される側を外しても位置が変わらないことを確かめた。
- [x] **F10. 要素(擬似要素でない)の `content`**: 文字列は何もしない(既存の `W_LAYOUT_DECLARATION_INERT` が出していた)。
  `url()` は要素を画像で置き換えるので効く(3 つのブラウザーで測った)。
## 済み(このチェックリストを作る前に済んだもの)

- [x] easing の行き過ぎ(cubic-bezier、`linear()`)の極値でのシフト検査と CLS の上限、終わりの戻り、relative のオフセット、
  複数のアニメーションの並び、同じ区間で一緒に動くプロパティ、`rem` の補間
- [x] `@property`、`@scope`(`to` を含む)、入れ子の CSS、`@supports`(表)、`@starting-style`(描画だけ)、`@namespace`
  (接頭辞付きと、SVG のないページの XHTML)、`@counter-style`、`@font-palette-values`、`@charset`、`@page`、`@view-transition`
- [x] `translate`・`rotate`・`scale` のプロパティ、回転角の `turn`・`grad`・`rad`
- [x] `W_CSS_IMPORT_IGNORED`、`W_CSS_KEYFRAME_IMPORTANT`、`W_CSS_FONT_NO_GENERIC`、inline の箱の `transform`
