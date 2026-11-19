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
  状態のない素の HTML でも、スタイルシートが名指すクラスの切り替え(`.panel` の要素に `.panel.open` の規則)は、そのクラスを
  足した計算値と比べる(その要素がすでに持つクラスを含む規則に限る)。
- [x] **F9. content のない `::before`・`::after`**(`W_CSS_PSEUDO_NO_CONTENT`): ほかのプロパティを書いても、content がなければ
  作られない。
- [x] **F11. 配置が Unknown でも報告する**: 配置の前に Unknown になる入力(配置を変える `:focus` の規則など)では、box ごとの警告(F2〜F4・
  F7・F8)が出なかった。配置が最後まで走らなかったときは、style だけを計算して木をたどり、同じ検査をする(F9 の擬似要素も)。
- [x] **F12. 長さのない transition**(`W_CSS_TRANSITION_NO_DURATION`): `transition: opacity` は 0s で、変化は一度に起きる。
  一括指定の各項目に時間がない場合と、`transition-property` だけで長さがない場合。明示した `0s` は意図とみなして報告しない。
- [x] **F13. 決まりすぎた絶対配置**(`W_LAYOUT_DECLARATION_INERT`): 両側の inset と大きさを全部書いた absolute・fixed の箱は、
  終わりの側(ltr では right、rtl では left、縦は bottom)が無視される(auto の margin があれば中央寄せに使われるので除く)。
  3 つのブラウザーで、無視される側を外しても位置が変わらないことを確かめた。
- [x] **F14. 線の種類のない border の幅**(`W_CSS_BORDER_NO_STYLE`): `border-style` は初期値 none なので、`border-width: 2px`
  だけでは線は描かれず幅も 0(解析もそう配置する)。幅を書いた辺のうち、使われる幅が 0 の辺を報告する。
- [x] **F15. 画像のない背景の大きさ・位置**(`W_LAYOUT_DECLARATION_INERT`): `background-size`・`-position`・`-repeat`・
  `-attachment`・`-origin` は `background-image` がなければ何もしない。`:hover` などの状態や media 条件で画像を当てる規則が
  その要素にあれば報告しない。
- [x] **F16. 線のない装飾の色・種類・太さ**(`W_LAYOUT_DECLARATION_INERT`): `text-decoration-color`・`-style`・`-thickness`
  は継承せず、その要素自身の装飾の線にだけ効くので、`text-decoration-line` が none なら何もしない。3 つのブラウザーで、
  これらの宣言を外しても描画が同じことを確かめた。
- [x] **F17. フォーカスできない要素の `:focus`**(`W_CSS_STATE_UNREACHABLE`): tabindex がなく、リンク・ボタン・フォーム部品・
  summary でもない要素の `:focus`・`:focus-visible` は当たらない(href のない `a` も)。動的な tabindex、iframe・動画などの
  フォーカスを記録していない要素は除く。3 つのブラウザーで、クリック・Tab・focus() のどれでもフォーカスされなかった。
- [x] **F18. `pointer-events: none` の要素の `:hover`**(`W_CSS_STATE_UNREACHABLE`): 子のない要素ではポインターが当たらず、
  `:hover` は当たらない(子があれば、子の hover が親に伝わりうるので除く)。
- [x] **F19. 当たらない `:checked`・`::placeholder`**(`W_CSS_STATE_UNREACHABLE`): `:checked` はチェックボックス・ラジオ・
  option にしか当たらない(role="checkbox" の div でも)。`::placeholder` は placeholder 属性のある文字欄・textarea にしかない。
  `:active` も `:hover` と同じく `pointer-events: none` の子のない要素には当たらない。
- [x] **F20. `:visited` の色でない宣言**(`W_CSS_VISITED_IGNORED`): 訪れたリンクを読み取られないよう、ブラウザーは `:visited`
  の規則のうち色(color、background-color、border・outline の色など)しか当てない。ほかの宣言を報告し、ブラウザーと同じく
  捨てる(以前は `:visited` を読めず Unknown)。3 つのブラウザーで、実際に訪れたリンクの色は変わり、幅(太さ・字間)は
  変わらないことを確かめた。
- [x] **F21. `:disabled`・`:enabled` を読む**(以前は Unknown): フォーム部品の disabled 属性と、disabled な fieldset の中
  (最初の legend の中は除く)、disabled な optgroup の中の option。disabled な select の中の option・optgroup は Chromium・WebKit
  が `:disabled` にし Firefox はしない(測った)ので、そこに頼る規則は Unknown。アダプターの式の disabled も Unknown。
  3 つのブラウザーの `matches()` と 11 の要素で一致。
- [x] **F22. `::marker` を読む・効かない宣言**(`W_CSS_MARKER_IGNORED`、以前は Unknown): `::marker` は色・content・font・
  white-space・アニメーションなどしか取らない。margin・padding・背景・大きさ・display は描画を変えない(3 つのブラウザーで
  測った)ので報告して捨てる。font-size や line-height など marker を大きくする宣言は、行の高さを変え(量はブラウザーで違う)、
  marker の箱は配置しないので Unknown。リスト項目でない要素の `::marker` は当たらない(`W_CSS_STATE_UNREACHABLE`)。
- [x] **`:target` を読む**(以前は Unknown): URL に fragment がないとして扱う状態(`:hover` と同じく、色だけの規則は描画の
  状態として受け、配置を変える規則は Unknown)。
- [x] **F23. 文字欄の `user-select: none`**(`W_LAYOUT_DECLARATION_INERT`): 文字欄・textarea の文字は選択も編集もできる
  ままで、何もしない(3 つのブラウザーで、3 回のクリックで 11 文字が選ばれた)。
- [x] **F24. 幅のない表の `table-layout: fixed`**(`W_LAYOUT_DECLARATION_INERT`): 固定の配置は表の幅が要る(CSS 2.2 §17.5.2)。
  width: auto の表では列は中身で決まる(3 つのブラウザーで、fixed を外したときと同じ列幅)。
- [x] **F25. 線を重ねた表の `border-spacing`**(`W_LAYOUT_DECLARATION_INERT`): `border-collapse: collapse` ではセルが線を
  共有し、間隔は何もしない(3 つのブラウザーで同じ位置)。
- [x] **F26. HTML の解析が補う tbody を飛ばす子の結合子**(`W_CSS_SELECTOR_IMPLIED_PARENT`): 行を table の直下に書いた
  HTML でも、解析は tbody を挟むので `table > tr`(や `.t > .r`)は当たらない。ソースに開始タグのない tbody・tr・colgroup を
  補われた要素として記録し、それを飛ばせば当たる選択子を報告する(3 つのブラウザーの `querySelector` と一致)。DOM の API で
  組み立てる UI ライブラリ(React など)は tbody を挟まないので、アダプターの木には印を付けない(HTML の解析を通るときだけ)。
- [x] **F27. HTML の解析が書いた構造を変える**(`W_HTML_RESTRUCTURED`): `<p>` の中の `<div>` は段落を閉じ、`</p>` は空の
  `<p>` になる。入れ子の `<a>` は外の `a` が早く閉じる。ソース上の位置のない要素と、終了タグの要る要素で解析が早く閉じたものを
  報告する(終了タグを省ける要素・空要素・SVG は除く)。表の中でセルの外に書いた要素は表の前へ移され(foster parenting)、
  form の中の `<form>` 開始タグは捨てられる(内側の action などが失われる):ソースの位置から見つける。解析も、ブラウザーと
  同じく解析後の木を配置する。3 つのブラウザーの DOM と一致。
- [x] **F28. 当てはまらない要素の見た目の属性**(`W_HTML_ATTRIBUTE_INERT`、以前は Unknown): `width`・`height` は画像・表・
  セル・埋め込みなどにしか、`bgcolor` は body と表の要素にしか、`border` は画像・表などにしか効かない(HTML rendering §15)。
  div などのそれは何もしないので、Unknown にせず報告する(当てはまる要素では今までどおり Unknown)。3 つのブラウザーで描画が
  属性のないときと同じ。
- [x] **F29. 空白だけの要素に `:empty`**(`W_CSS_EMPTY_WHITESPACE`): `:empty` は空白(スペースや改行)を中身として数えるので、
  `<div class="x"> </div>` には当たらない。コメントだけなら当たる。3 つのブラウザーで同じ結果を測った。
- [x] **F30. 置き換え要素・フォーム部品の `display: contents`**(`W_LAYOUT_CONTENTS_REMOVED`): img・input・textarea・select・
  video・iframe・canvas・progress・meter・br・audio・object・embed などは、子を代わりに出せないので `display: none` になる
  (CSS Display 付録 B)。解析もそのとおり none として配置する。3 つのブラウザーで 0×0 を測った(button・fieldset・ul・li・
  details・table は子が出るので報告しない)。
- [x] **F31. 表の `overflow: auto`・`scroll`**(`W_LAYOUT_DECLARATION_INERT`): 表は中身に合わせて広がる(幅は最小値)ので、
  スクロールしない。3 つのブラウザーで visible と同じ(はみ出しも切られない。hidden・clip は切る)。解析も visible として扱う。
  スクロールさせるには、表を `overflow-x: auto` の div で包む。片方の軸が hidden・clip の組み合わせは測っていないので今までどおり。
- [x] **F32. 擬似要素を描かない要素の `::before`・`::after`**(`W_CSS_PSEUDO_NOT_RENDERED`、以前は Unknown): 読み込んだ img、
  文字欄の input(text・email・password・search・tel・url・number)、select・textarea・iframe・video・br・canvas は、content が
  あっても `::before`・`::after` を描かない(3 つのブラウザーで、規則のあるときとないときの描画が同じ)。解析も生成しない。
  読み込めなかった img(Chromium・Firefox は描く)と、appearance: auto の checkbox・radio(Chromium・WebKit は描く)は
  ブラウザーで違うので今までどおり。
- [x] **F33. 描かれない兄弟で外れる `:last-child`・`:nth-child`**(`W_CSS_CHILD_INDEX_HIDDEN_SIBLING`): template・script・style・
  link・meta は描かれない(display: none)が、`:first-child`・`:last-child`・`:only-child`・`:nth-child` の数には入る。それらが
  なければ当たる規則を報告する(`-of-type` は別の要素名なので影響しない)。また `template`(shadowrootmode のないもの)を
  UA の display: none として扱い、Unknown にしない(author の display は今までどおり Unknown)。3 つのブラウザーで測った。
- [x] **F34. flex・grid の容器の `columns`**(`W_LAYOUT_DECLARATION_INERT`、以前は Unknown): 段組みはブロック容器にしか
  効かない。flex・grid の容器の `columns`・`column-count`・`column-width` は、3 つのブラウザーで項目の位置がないときと同じ。
  解析はそれを捨てて配置する(ブロック容器の段組みは今までどおり Unknown)。
- [x] **F35. フォーカスできるもののない要素の `:focus-within`**(`W_CSS_STATE_UNREACHABLE`): その要素にも中にも、href のある
  リンク・フォーム部品・tabindex がなければ、何もフォーカスを持たないので当たらない(外から渡される slot・children が
  あれば報告しない)。あわせて F17 を直した: `tabindex="-1"` の要素はクリックや focus() でフォーカスを持つ(3 つのブラウザーで
  測った)ので、その `:focus` は報告しない。
- [x] **F36. inline の要素の `:hover`・`:focus` の transform**(`W_LAYOUT_DECLARATION_INERT`、state 付き): 文の中のリンクや
  span(display: inline)には transform・translate・rotate・scale が効かないので、`a:hover { transform: translateY(-2px) }` の
  持ち上げは見えない(3 つのブラウザーで、hover しても位置が同じ)。同じ規則で display を変えるもの、inline-block・置き換え
  要素は報告しない。配置が Unknown でも、文の中の要素まで見て報告する。
- [x] **F37. ブロック容器でない要素の `::first-letter`・`::first-line`**(`W_CSS_STATE_UNREACHABLE`、以前は Unknown): この 2 つは
  ブロック容器(block・inline-block・list-item・表のセルなど)にしかない。display: inline・flex・grid の要素では何も変わらない
  (3 つのブラウザーで、規則のあるときとないときの描画が同じ)。その要素だけなら報告して配置を続ける。ブロック容器に当たる
  ときは、変わる最初の文字・行を解析しないので今までどおり Unknown。
- [x] **F38. 中央に寄らない絶対配置の `margin: auto`**(`W_LAYOUT_AUTO_MARGIN_ABSOLUTE`): 絶対配置・固定配置の箱の auto の
  margin は、その軸の両方の inset(left と right、top と bottom)と大きさが決まっているときにだけ中央に寄せる。どれかが auto なら
  margin は 0 で、箱は流れの中にいたはずの位置に残る(CSS 2.2 §10.3.7・§10.6.4、3 つのブラウザーで測った)。寄らない軸を報告する。
- [x] **F39. `object-fit: fill` の `object-position`**(`W_LAYOUT_DECLARATION_INERT`): fill(初期値)は画像を箱いっぱいに
  引き伸ばすので、置く場所がない。contain・cover・none・scale-down では効く(3 つのブラウザーで、fill のときだけ描画が同じ)。
- [x] **F40. `place-items`・`place-content`・`place-self` を読む**(以前は Unknown): `<align> [<justify>]` の一括指定を
  align-*・justify-* に分けて読む(CSS Box Alignment 3 §5.3。place-content の baseline 1 つは justify が start)。
  分けたあとは今までの検査がそのまま効く(ブロック容器の place-items は align-items が効かないと報告する)。3 つのブラウザーで、
  一括指定と個別指定の配置が同じことを確かめた。
- [x] **F41. 図形が自分の属性を持つ svg の `fill`・`stroke`**(`W_LAYOUT_DECLARATION_INERT`): svg に書いた fill・stroke は継承で
  図形に届くだけなので、すべての図形(か、それを囲む g)が fill・stroke 属性を持つと何も変わらない(3 つのブラウザーで測った。
  属性が inherit のとき、属性のない図形があるとき、図形を直接選ぶ規則があるときは報告しない)。
- [x] **F42. ブラウザーが描く checkbox・radio の背景・色・線・内側の余白**(`W_LAYOUT_DECLARATION_INERT`): appearance: auto の
  checkbox・radio は、background-color・color・border・padding で描画も大きさも変わらない(3 つのブラウザーで、画素も
  大きさも後ろの要素の位置も同じ)。accent-color か appearance: none を勧める。あわせて、ブラウザーの checkbox の配置
  (accessibility の検査)が padding・border のある書き方でも働くようにした。(box-shadow は WebKit だけ描かないので除いた。)
- [x] **F43. 表のセルの最小・最大の大きさ**(`W_LAYOUT_DECLARATION_INERT`、高さは以前 Unknown): セルの min-height・max-height は
  何もしない(行の高さで決まる)。table-layout: fixed(幅のある表)では min-width・max-width も何もしない。3 つのブラウザーで、
  auto・fixed の両方の表で測った(auto の表の min-width・max-width は効くので報告しない)。高さの上下限は捨てて配置する。
- [x] **F44. `pointer-events: none` の要素の `cursor`**(`W_LAYOUT_DECLARATION_INERT`): 出るカーソルはポインターの下の要素の
  もので、pointer-events: none(継承も)の要素はポインターに当たらないので、その cursor は出ない(子の要素がなく、
  pointer-events を取り戻せないとき)。3 つのブラウザーで、その要素の中心の当たり判定が下の要素になることを測った。
- [x] **F45. inline の要素の `text-align`・`text-indent`・`text-align-last`**(`W_LAYOUT_DECLARATION_INERT`、後ろの 2 つは以前
  Unknown): これらはブロック容器の行を揃え・字下げするので、子の要素のない display: inline の要素(span・a)では何も
  変わらない(3 つのブラウザーで描画が同じ)。text-indent・text-align-last はそのときだけ捨てて配置し、ブロックでは今までどおり
  Unknown。
- [x] **F46. `::selection` を読む・効かない宣言**(`W_CSS_SELECTION_IGNORED`、以前は Unknown): ::selection は選んだ文字に色を
  塗るだけで、配置を変えない(利用者の操作で、解析する状態ではない)ので、カスケードから外して読む。その中の font-size・
  font-weight・letter-spacing・opacity・padding・border・margin・outline は 3 つのブラウザーで何も変えないので報告する
  (測るとき、WebKit は ::selection の規則があるだけで選択の塗りが変わるので、性質のない ::selection の規則と比べた)。
- [x] **F47. `::placeholder` の効かない宣言**(`W_CSS_PLACEHOLDER_IGNORED`): 入力欄の中に描く placeholder には margin・height・
  display・position が効かない(3 つのブラウザーで、性質のない ::placeholder の規則と比べて画素も欄の大きさも同じ)。
  padding・border・width はブラウザーで違う(Chromium・WebKit は padding を描く)ので報告しない。
- [x] **F48. `:link`・`:any-link` を読む・リンクでない要素**(`W_CSS_STATE_UNREACHABLE`、以前は Unknown): この 2 つは href の
  ある a・area にだけ当たる(空の href も。3 つのブラウザーで測った)。href のない a や button に書くと当たらないので報告する。
  解析はリンクを未訪問とみなすので :link は :any-link と同じに読むが、配置を変える :link の規則は訪問の履歴で変わるので Unknown。
- [x] **F49. `:placeholder-shown` を読む・placeholder 属性のない欄**(`W_CSS_STATE_UNREACHABLE`、以前は Unknown): 文字の欄
  (text・search・url・tel・email・password・number)と textarea で、placeholder 属性があり(空でも)、値が空のときに当たる
  (3 つのブラウザーで測った)。属性のない欄では当たらない(浮く label の作り方で placeholder=" " を忘れる)ので報告する。
  入力すると外れるので、配置を変える規則は Unknown。値が分からないとき(動的な value、空白だけの textarea)も Unknown。
- [x] **F50. `:required`・`:optional` を読む・フォームの欄でない要素**(`W_CSS_STATE_UNREACHABLE`、以前は Unknown): :required は
  required 属性のある select・textarea・input(required を取る型。readonly・disabled でも)に、:optional はそれ以外の
  input・select・textarea に当たる(3 つのブラウザーで測った)。label や div、required を無視する型(range・color・hidden・
  ボタン)に書くと当たらないので報告する(`label:required::after { content: "*" }` の書き間違い)。required を取らない型の
  input と button の :optional は Firefox だけ当たらないので Unknown。
- [x] **F51. html と body の両方の overflow で止まる sticky**(`W_LAYOUT_STICKY_SCROLLER`): body の overflow は html の overflow が
  visible のときだけ viewport に移る。`html, body { overflow-x: hidden }` のように両方に書くと、body が内容と同じ高さの
  スクロール容器になり、sticky の見出しは body に貼り付いてページと一緒に流れる(3 つのブラウザーで、500px 送ると見出しが
  上に消える。clip はスクロール容器を作らないので貼り付く)。配置が Unknown でも報告する。
- [x] **F52. 無効な `grid-template-areas`**(`W_CSS_GRID_AREAS_INVALID`、以前は Unknown): 行ごとに区画の数が違う、または同じ名前が
  1 つの長方形にならない値は、宣言ごと捨てられる(3 つのブラウザーで CSS.supports が false、配置が宣言のないときと同じ)。
  解析も読むときに捨て、そこで名付けた grid-area は分からなくなる(自動で並ぶ)と報告する。
- [x] **F53. ブロックの流れの中の縦の `margin: auto`**(`W_LAYOUT_DECLARATION_INERT`、以前は Unknown): 流れの中のブロックの
  margin-top・margin-bottom の auto は 0 で、縦に中央へ寄せない(CSS 2.2 §10.6.3。3 つのブラウザーで、flow-root・
  overflow: hidden の親でも同じ。flex・grid では寄る)。解析も 0 として配置し、位置がブラウザーと同じことを確かめた。
- [x] **F54. flex・grid の項目の `clear`**(`W_LAYOUT_DECLARATION_INERT`、以前は Unknown): 項目には float が効かないので、
  clear で避けるものがない(3 つのブラウザーで、横に float があってもなくても配置が同じ)。捨てて配置する。ブロックの流れの
  clear は float を解析しないので今までどおり Unknown。
- [x] **F55. 高さのない親の中の relative の `top`・`bottom` の %**(`W_LAYOUT_DECLARATION_INERT`、以前は Unknown): % は包含ブロックの
  高さに対する値で、ブロックの流れの中の高さ auto の親では決まらないので auto になり、箱は動かない(3 つのブラウザーで同じ)。
  解析も auto として配置し、位置がブラウザーと同じことを確かめた。親が伸びる grid・flex の項目なら高さが決まり、Chromium・
  Firefox は % を解く(WebKit は解かない)ので、親自身がブロックの流れの中にあるときだけ扱う。
- [x] **F56. 高さのない親の中の `height` の %**(`W_LAYOUT_DECLARATION_INERT`、以前は Unknown): height・min-height・max-height の %
  は親の高さに対する値で、ブロックの流れの中の高さ auto の親(min-height があっても)では決まらないので、height は auto、
  min-height は 0、max-height は none になる(CSS 2.2 §10.5。3 つのブラウザーで、大きさと後ろの要素の位置が解析と同じ)。
  F55 と同じく、親自身がブロックの流れの中にあるときだけ扱う(grid の中では親の高さが決まって % が効く)。
- [x] **F57. inline の要素の `overflow`・`text-overflow`・`resize`**(`W_LAYOUT_DECLARATION_INERT`): これらはブロック容器(と置き換え
  要素)にしか効かないので、display: inline の span・a では切り取りも省略記号もスクロールも起きない(3 つのブラウザーで描画が
  同じ。inline-block では効く)。解析も初期値として扱う。絶対配置・float・flex や grid の項目は block になるので除く。
- [x] **F58. 先祖の線を消せない `text-decoration: none`**(`W_LAYOUT_DECLARATION_INERT`): text-decoration: none は自分の線だけを
  消すので、自分に線がなく(リンクの UA の下線や、ほかの規則を上書きしていない)、先祖が線を引いているとき(`a span {
  text-decoration: none }` など)は何も変わらない(3 つのブラウザーで、inline・inline-block・block の子のどれでも描画が同じ)。
- [x] **F59. 線を重ねた表の `border-radius`**(`W_LAYOUT_DECLARATION_INERT`): border-collapse: collapse の表では、border-radius で
  表の線は丸くならない(3 つのブラウザーで、背景のない表の描画が同じ。背景だけは丸く切られる)。separate と border-spacing: 0
  にするか、丸い div で包むことを勧める。同じ表に radius 0 の規則があれば報告しない。
- F9 を直した: 解析が読めない content(`attr(data-tip)` など)を書いた ::before・::after を「content がない」と報告していた。
  content を書いた規則に当たる擬似要素は報告しない(その配置は今までどおり Unknown)。
- [x] **F60. 表の `gap`、線を重ねた表の `padding`**(`W_LAYOUT_DECLARATION_INERT`、padding は以前 Unknown): 表のセルの間は gap では
  空かず(border-spacing を使う)、border-collapse: collapse の表には padding がない(3 つのブラウザーで配置が同じ。separate の表の
  padding は効く)。collapse の表の padding は 0 として配置する。(表の aspect-ratio は WebKit だけ効くので除いた。)
- [x] **F61. `:read-write`・`:read-only` を読む・書けない要素の `:read-write`**(`W_CSS_STATE_UNREACHABLE`、以前は Unknown):
  :read-write は readonly でも disabled(fieldset から受けるものも)でもない textarea と文字の input(text・search・url・tel・
  email・password・number・date)に当たり、ほかはすべて :read-only(3 つのブラウザーで測った)。div・button・checkbox・range に
  :read-write を書くと当たらないので報告する。contenteditable、動的な disabled、測っていない型(time など)は Unknown。
- 試して当てはまらなかったもの: `progress`・`input[type=range]` の `appearance: none` は、3 つのブラウザーとも何かを描く
  (消えない)ので報告しない。

## G. HTML の要素が持つ働きを CSS が消す書き方

- [x] **G1. 開閉の三角形を失った summary**(`W_A11Y_SUMMARY_INDICATOR`): `summary` の display を list-item 以外にするか
  `list-style: none` にすると、開閉の三角形が消える(3 つのブラウザーで、display: block の描画が list-style: none と同じ)。
  `::before`・`::after` の content や子の要素(アイコン)がなければ、開いているかどうかを示すものがない。
- [x] **F10. 要素(擬似要素でない)の `content`**: 文字列は何もしない(既存の `W_LAYOUT_DECLARATION_INERT` が出していた)。
  `url()` は要素を画像で置き換えるので効く(3 つのブラウザーで測った)。
## 済み(このチェックリストを作る前に済んだもの)

- [x] easing の行き過ぎ(cubic-bezier、`linear()`)の極値でのシフト検査と CLS の上限、終わりの戻り、relative のオフセット、
  複数のアニメーションの並び、同じ区間で一緒に動くプロパティ、`rem` の補間
- [x] `@property`、`@scope`(`to` を含む)、入れ子の CSS、`@supports`(表)、`@starting-style`(描画だけ)、`@namespace`
  (接頭辞付きと、SVG のないページの XHTML)、`@counter-style`、`@font-palette-values`、`@charset`、`@page`、`@view-transition`
- [x] `translate`・`rotate`・`scale` のプロパティ、回転角の `turn`・`grad`・`rad`
- [x] `W_CSS_IMPORT_IGNORED`、`W_CSS_KEYFRAME_IMPORTANT`、`W_CSS_FONT_NO_GENERIC`、inline の箱の `transform`
