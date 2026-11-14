# ADR-0013: DOM と CSS を組み合わせた静的アクセシビリティ検査

- 状態: 実装中(69規則、HTML adapter・Isle template・Vite・playground に接続)
- 日付: 2026-11-13
- Issue: 未作成
- 対応する提案: ユーザー指示「思いつく限りのCSSとDOMを組み合わせた静的検査パターンを実装したい」。ADR-0007(静的コントラスト契約)の text-contrast を含む

## 背景

css-verifier は、カスケードの結果(計算値)と border box の位置・寸法を viewport の全域で証明している。
多くのアクセシビリティの欠陥は、DOM の事実(要素の種類、名前、`aria-hidden`、id、木の順序)と
CSS の結果(`display`・`visibility`・`pointer-events`・色・配置・重なり)の**組み合わせ**で決まる。
どちらか一方だけを見る lint や、特定の幅で描画する実行時検査では、メディアクエリで変わる状態を取りこぼす。

## 判断

`options.accessibility`(`true` か `{contrast: 'AA' | 'AAA'}`)で有効にする規則を `src/layout/accessibility.mjs` に置く。
既定では無効で、既存の結果は変わらない。各規則は engine が解いた geometry の行(領域・矩形・計算値の paint 事実・祖先の paint 鎖)と
box tree の DOM 事実だけを入力にし、違反は viewport の区間(領域)として報告する。判定できない場合は Unknown にする。

| 規則 | 組み合わせ | 診断 |
| --- | --- | --- |
| accessible-name | button / `a[href]` に、描画される可視のテキストも `aria-label`・`title`・解決できる `aria-labelledby` もない。`display:none`・`visibility:hidden` のテキストは名前にならない。`visibility:hidden` と `aria-hidden` の内側は対象外 | E_A11Y_NAME |
| text-contrast | 継承した `color` と、祖先の背景を内側から合成した色。WCAG 2.2 SC 1.4.3(AA)/1.4.6(AAA)、大きな文字は 24px か 56/3 px 以上の bold | E_A11Y_CONTRAST |
| occluded-target | 後から描かれる positioned box(`pointer-events` が none でなく可視)が操作対象の一部を覆う | E_A11Y_OCCLUDED |
| target-overlap | 2つの操作対象の border box が重なる | E_A11Y_TARGET_OVERLAP |
| visual-order | 後の兄弟が前の兄弟の上、または同じ行の左に置かれる(SC 1.3.2) | W_A11Y_ORDER(警告) |
| hidden-focusable | `aria-hidden` の内側で、描画され可視のフォーカス可能な要素 | E_A11Y_HIDDEN_FOCUSABLE |
| empty-heading | 公開される h1–h6 に可視のテキストも名前もない | E_A11Y_EMPTY_HEADING |
| heading-order | 描画される見出しの並びで階層が飛ぶ。メディアクエリの領域ごとに、間の見出しが描画される領域を除いて判定 | W_A11Y_HEADING_ORDER(警告) |
| nested-interactive | 描画される button/link の内側の button/link | E_A11Y_NESTED_INTERACTIVE |
| duplicate-id | 同じ id(DOM、全域) | E_A11Y_DUPLICATE_ID |
| aria-reference | `aria-labelledby`・`aria-describedby`・`aria-controls` が存在しない id を指す | E_A11Y_REFERENCE |
| positive-tabindex | tabindex > 0 | W_A11Y_POSITIVE_TABINDEX(警告) |
| multiple-main | 同じ viewport で2つ以上の main が描画される | W_A11Y_MULTIPLE_MAIN(警告) |
| scrollable-region-focusable | scroll container 自身の content box が溢れる(証明した区間)のに、それも内側もフォーカスできない | E_A11Y_SCROLL_FOCUS |
| reflow | 320 CSS px 以下で横スクロールが生じる(SC 1.4.10)。domain が 320px より上から始まる場合は note | E_A11Y_REFLOW |
| focus-obscured | フォーカス可能な box が、後から描かれる塗りのある box に完全に覆われる(SC 2.4.11) | E_A11Y_FOCUS_OBSCURED |
| focus-area | 可視のフォーカス可能な box の幅か高さが 0 | E_A11Y_FOCUS_AREA |
| pointer-disabled | 可視の button/link が継承した `pointer-events: none` でクリックできない | E_A11Y_POINTER_DISABLED |
| small-text | 描画される文字が 12px 未満 | W_A11Y_SMALL_TEXT(警告) |
| image-alt | 描画され公開される img に `alt` がない(`alt=""` は装飾)。`alt` は link/button の名前にもなる | E_A11Y_IMAGE_ALT |
| form-label | input(hidden・submit・reset・button・image 以外)・select・textarea に、`aria-label`・`title`・`aria-labelledby` も、**描画され可視の**テキストを持つ label(包む label か `label[for]`)もない。placeholder だけなら警告 | E_A11Y_LABEL / W_A11Y_PLACEHOLDER_LABEL |
| label-for | `label[for]` が labelable な要素(button・hidden 以外の input・select・textarea・output)を指さない | E_A11Y_LABEL_FOR |
| list-structure | 描画される li の親が ul/ol でない、または ul/ol に li 以外の子がある。ul/ol の UA margin・padding と li の `display: list-item` は reset するまで Unknown | E_A11Y_LIST |
| radio-group | 同じ name の radio が、fieldset か `role=radiogroup`/`group` の外で同時に描画される | W_A11Y_RADIO_GROUP(警告) |
| landmark-name | 2つの navigation landmark が同時に描画され、どちらかに名前がないか、同じ名前(`aria-label` の文字列を比較) | W_A11Y_LANDMARK_NAME(警告) |
| role-valid | `role` の最初の token が WAI-ARIA の role でない | E_A11Y_ROLE |
| interactive-role-focusable | widget role(button・link・checkbox など)の要素が描画されるのにフォーカスできない。名前の規則も widget role に適用する | E_A11Y_ROLE_FOCUS |
| link-in-text-block | 文中のリンクが下線を持たず、周囲の文字色との比が 3:1 未満(SC 1.4.1、色だけで区別) | E_A11Y_LINK_IN_TEXT |
| table-headers | table の th が DOM にあるのに、data cell が描画される領域で1つも描画されない(エラー)。th がまったくない data table は警告。`role=presentation/none` は対象外 | E_A11Y_TABLE_HEADERS / W_A11Y_TABLE_HEADERS |
| td-headers | td/th の `headers` が同じ table の th を指さない | E_A11Y_TABLE_HEADERS_REF |
| fieldset-name | 描画される fieldset に legend も名前もない | W_A11Y_FIELDSET_NAME(警告) |
| label-in-name | control の `aria-label` が、描画され可視のテキスト(text 行ごと)を含まない(SC 2.5.3、大文字小文字と空白を畳んで比較) | E_A11Y_LABEL_IN_NAME |
| link-purpose | 同じ名前のリンクが別の href を指し、同時に描画される | W_A11Y_LINK_PURPOSE(警告) |
| link-text | 行き先を表さない汎用のリンク文言(click here・read more・こちら・詳細 など) | W_A11Y_LINK_TEXT(警告) |
| role-parent / role-children | WAI-ARIA 1.2 の必須の文脈(tab は tablist の中、list は listitem だけを持つ など)。暗黙の role を HTML-AAM で求め、generic な要素は透過 | E_A11Y_ROLE_PARENT / E_A11Y_ROLE_CHILDREN |
| role-attr | role に必須の状態(checkbox の `aria-checked`、slider の `aria-valuenow` など。同じ意味のネイティブ要素は除く) | E_A11Y_ROLE_ATTR |
| aria-attr / aria-value | ARIA 1.2 にない `aria-*`、真偽値・三値の属性の不正な値 | E_A11Y_ARIA_ATTR / E_A11Y_ARIA_VALUE |
| presentation-conflict | `role=none/presentation` がフォーカス可能な要素や名前付きの要素にあり、無視される | E_A11Y_PRESENTATION_CONFLICT |
| empty-th | 描画される th に可視のテキストも名前もない | E_A11Y_EMPTY_TH |
| redundant-alt | 画像の alt が隣のテキストと同じ | W_A11Y_REDUNDANT_ALT(警告) |
| title-only | field の名前が title だけ | W_A11Y_TITLE_ONLY(警告) |
| input-button-name | `input type=button` に value がない | E_A11Y_INPUT_BUTTON_NAME |
| autocomplete | HTML の autofill の文法にない token(SC 1.3.5) | E_A11Y_AUTOCOMPLETE |
| scope | th 以外の scope、row/col/rowgroup/colgroup 以外の値 | E_A11Y_SCOPE |
| html-lang / lang-valid | root の html に lang がない、言語タグとして不正な lang(SC 3.1.1/3.1.2) | E_A11Y_HTML_LANG / E_A11Y_LANG_VALID |
| page-h1 / region / bypass | root が html/body のとき:h1 が描画されない領域、landmark の外の内容、main より前の nav に skip link がない | W_A11Y_PAGE_H1 / W_A11Y_REGION / W_A11Y_BYPASS(警告) |
| landmark-top-level / duplicate-landmark | main・complementary が他の landmark の中、同時に描画される2つの banner/contentinfo | 警告 |
| p-as-heading | 太字(600以上)か 1.2 倍以上の文字の p が、普通の p の前にある(見出しを CSS で装う) | W_A11Y_P_AS_HEADING(警告) |
| orientation | main が片方の向き(`(orientation: landscape/portrait)`)でだけ描画されない(SC 1.3.4) | E_A11Y_ORIENTATION |
| focus-visible | フォーカス時に何も変わらない:作者が outline を消し、box-shadow・色・背景も変わらない(SC 2.4.7)。作者が outline-style を指定しなければ UA の focus ring があるとする | E_A11Y_FOCUS_VISIBLE |
| state-contrast | `:hover`・`:focus` の色での文字のコントラスト | E_A11Y_STATE_CONTRAST |
| text-spacing | フォント由来の契約を持ち clip する text が、line-height を 1.5 × font-size にすると同じ行数でも入らない(SC 1.4.12。字間・語間の拡大は行を増やすだけなので確定した違反)。1行の固定文字列は letter-spacing 0.12em × 文字数と word-spacing 0.16em × 空白数だけ幅が増え、clip する box より広くなれば違反(inline 軸) | E_A11Y_TEXT_SPACING |
| hover-only | 基本の状態で隠れた(opacity 0 か visibility hidden)control が `:hover` で現れ、focus では現れない(SC 2.1.1・1.4.13) | E_A11Y_HOVER_ONLY |
| clickable-look | `cursor: pointer` をその要素で(継承ではなく)指定したのに、フォーカスも interactive な role もない(SC 2.1.1。click handler は木の外なので警告) | W_A11Y_CLICK_LOOK |
| list-style-semantics | role のない ul/ol の li が全て `list-style-type: none`(WebKit/VoiceOver は list として読まない。nav の中は除く) | W_A11Y_LIST_STYLE |
| motion | 5 秒を超える(か無限の)animation を `prefers-reduced-motion: reduce` でも止めない(SC 2.2.2・2.3.3) | W_A11Y_MOTION |
| blink | 描画される marquee(SC 2.2.2) | E_A11Y_BLINK |
| definition-list | dl の子が dt・dd・それらの div 以外、または dl の外の dt/dd | E_A11Y_DL |
| accesskeys | 同じ accesskey を複数の要素が持つ | W_A11Y_ACCESSKEY |
| server-side-image-map | `img ismap`(座標を送るだけで keyboard では使えない、SC 2.1.1) | W_A11Y_ISMAP |
| aria-hidden-body | body の `aria-hidden="true"`。Chromium は body の aria-hidden を無視する(AX tree で測定)ので他の規則は中身を公開されたものとして扱い、尊重する UA では文書全体が隠れることを警告する | W_A11Y_ARIA_HIDDEN_BODY |
| frame-title | 描画される iframe に title も名前もない(SC 4.1.2) | E_A11Y_FRAME_TITLE |
| video-caption | 描画される video に kind=captions/subtitles の track がない(SC 1.2.2) | E_A11Y_VIDEO_CAPTION |
| autoplay-audio | muted でない autoplay の video/audio(SC 1.4.2) | W_A11Y_AUTOPLAY_AUDIO(警告) |
| document-title / meta-viewport | 検査付き Vite build で配信する文書:空でない `<title>` がない(SC 2.4.2)、`user-scalable=no` か `maximum-scale < 2`(SC 1.4.4) | E_A11Y_DOCUMENT_TITLE / E_A11Y_META_VIEWPORT |
| target-size | SC 2.5.8:24px 未満の操作対象で、border box の中心に置いた 24px の円が他の操作対象の box か、他の小さい対象の円と交わる(spacing 例外を満たさない) | E_A11Y_TARGET_SIZE |

### target-size の円(非線形)の扱い

円との交差は距離の2乗の比較で、viewport の affine 式の2次式になる。領域は有理数の凸多角形なので、次のように決める。

- 2つの中心の差(または中心から相手の box の最も近い点までの差)の両成分が viewport に依らない定数なら、有理数で2乗を厳密に比較する。
- 片方の成分が恒等的に0なら、もう一方の絶対値と半径の線形比較で厳密に決まる(横一列や縦一列の配置)。
- 両成分が変わるときは、ピタゴラス数で作った有理単位法線(第1象限で約2.5°間隔)の多角形で円を内側と外側から挟む。
  内側の多角形 `n·p < r·c`(c は cos(間隔/2) の有理の下界)に入れば交わり、外側の多角形 `n·p < r` の外なら交わらない。
  間の帯(幅 0.01px 未満)は、同じ対象に証明した違反がなければ Unknown にする。

### 2.5.8 の他の例外と AAA(SC 2.5.5)

- **Equivalent**:DOM の `data-a11y-equivalent="id"`(box tree の `equivalent`)で同じ機能の別の control を宣言する。
  宣言を信頼せず、参照先が存在し、描画され可視で、その領域で自身が target-size を満たす部分だけを免除する(`report.accessibility.exempted`)。
  互いを指す2つの小さい対象は免除されない。参照先が隠れる幅、存在しない id では違反のまま。動的な値は Unknown。
- **Essential**:`data-a11y-essential="理由"` は作者の表明として、理由を付けて免除に記録する(検証ではない)。
- **Inline**:文中の inline の対象は検査対象のサブセットの外(inline box は Unknown)なので生じない。
- **User agent control**:検査対象の button は `appearance: none` などの reset を要求するため、UA が寸法を決める control は生じない。
- **AAA**:`accessibility.targetLevel: 'AAA'` で SC 2.5.5 の 44px を要求し、spacing 例外を適用しない(equivalent と essential は適用する)。
  `accessibility.targetSize` で寸法を直接指定することもできる。
ADR-0012 の target-undersized(vlmkit と同じく spacing を考えない)とは別の規則である。

違反は checks の義務ではないため、Z3 のモデルにはその違反領域が空でないことの確認として入る(`rule` を持つ診断)。

### axe-core と WCAG からの網羅

axe-core の規則と WCAG 2.2 の達成基準を一つずつ見て、静的に決まるものを取り込んだ(上の表)。
`(orientation: …)` の media query を加えた(portrait は height ≥ width、landscape は width > height で、2次元の領域として厳密)。
2次元の領域は幅と高さの区間の積ではないので、診断に領域の制約(`region`)を付けた。
### 状態の擬似クラス(`:hover`・`:focus` など)

末尾の `:hover`・`:active`・`:focus`・`:focus-visible`・`:focus-within` を状態として compile する。基本の状態では一致しない。
状態の規則が paint 以外(幾何に効くプロパティ)を宣言すると Unknown のまま:証明した幾何は基本の状態のものだから。
engine はフォーカスできる box の focus 状態、操作対象の hover 状態の paint を計算し、focus-visible・state-contrast が使う。
`outline`(style と width)と `box-shadow` を計算値に保持するようにした。

取り込まなかったもの:hover/focus で**現れる**内容(SC 1.4.13。表示を変える状態の規則は幾何に効くので Unknown)、
文字の集合(domain)の字間・語間による幅。
折り返す固定文字列は、フォント層で字間 0.12em・語間 0.16em を加えた行の profile(`spacedProfile`)も求め、text-spacing はその行数で判定する。
letter-spacing が 0 でないとき Chromium は任意の ligature を切る(CSS Text 3)ので、FFI の shaping に `ligatures` を渡して同じにした。
`iframe`・`video`・`audio`(controls のあるときだけ box)・`track`・`source` を box tag に加えた(iframe・video・audio は display block と寸法の明示が必要)。

### 利用者の設定(`prefers-*`・`forced-colors`)

`@media (prefers-reduced-motion: …)`・`(prefers-color-scheme: …)`・`(prefers-contrast: …)`・`(forced-colors: …)` を、幅の条件ではなく**状態**として扱う
(`:hover` と同じく paint と animation だけを変えてよい。幾何を変える規則は U_LAYOUT_QUERY)。基本の解析は既定値
(no-preference・light・none)で行い、幾何はその下で証明する。

- dark:CSS に `prefers-color-scheme: dark` の規則があれば、同じ木を dark の状態でもう一度解析し、コントラストの規則
  (text-contrast・state-contrast・link-in-text-block・focus-visible)の結果を `preference: 'prefers-color-scheme: dark'` 付きで加える。
  light と同じ finding は1つにまとめ `alsoUnder` に dark を記す。system color(canvas/canvastext)は light のまま:`color-scheme` プロパティは範囲外。
- reduced motion:animation のある box は `prefers-reduced-motion: reduce` の状態の paint も計算し、motion が使う。
  `animation` の shorthand(1つ)と longhand の name・duration・iteration-count・play-state を保持し、`@keyframes` は名前だけ読む(定義のない名前は動かない)。
  `transition` は paint として無視する。

### table と fieldset

table 系の要素は、作者が grid・`contents`・block に組み替えた場合と、次の**固定 table レイアウト**の部分集合を検査する。
`table-layout: fixed`・`border-collapse: separate`・明示した inline-size・thead/tbody/tfoot と同じ列数の行なら、
CSS 2.2 §17.5.2.1 の固定 table は次の grid と同じになることを Chromium で測って確かめた:1行目の cell の幅が列を決め、px の列は幅を比例で分け
(`minmax(0, w fr)`)、auto の列は残り(`minmax(0, 1fr)`)、`border-spacing` は gap と padding の内側の余白、行は最も高い cell の高さ、cell は列と行に広がる
(cell の inline-size は列の幅になる)。content-box の table は端の spacing を幅の内側に持つ。px の列の和より狭い table は幅を超えて広がるので
`E_LAYOUT_TABLE_WIDTH` で報告する。UA の cell padding(1px)と `border-spacing`(2px)をモデルにした。
`colspan` の cell は `span n` の grid item で、1行目の幅 w の cell は各列に (w − (n−1)·spacing)/n を与える(Chromium で測定)。
`caption` は table の枠の外(上か下、`caption-side`)で table と同じ幅になり、table 要素の矩形は caption を含む:
table の border と padding がないとき、全列にまたがる最初(か最後)の行として扱う。`border-spacing` があれば caption は全幅のまま行だけが内側に入るので、
spacing を明示した gap track(`h c1 h c2 h`、行も同様)にし、各 cell を明示した grid area に置く(colspan・rowspan と組み合わせて Chromium と一致)。
table の背景は table の box だけを塗り caption の下には描かれない(screenshot で測定)ので、caption の中身のコントラストは table の背景を飛ばした背後で判定する
(以前は table の背景の上として判定していた:誤り)。vlmkit の contrast も DOM の祖先の背景を重ねるので、この case は描画した画素で確かめた。
`rowspan` は、中身がなく高さ auto の cell が行グループの中でだけ広がるとき `grid-row: span n` として扱い、行は他の cell の px の高さを明示した track にする
(Chromium と grid では span する cell の余りの配り方が違うので、行の高さを決める rowspan cell は Unknown)。
**自動 table レイアウト**(`table-layout: auto`)は、内容が列を広げられないときだけ固定 table と同じになる(Chromium で測定):
全ての cell が空か、内容の min-content の上界(`minInlineSize`)が px の列に収まり、span と caption がなく、auto の列は1つまで(空)。
幅を明示した table と grid の中の auto 幅の table(grid area に伸びる)は余りを px の比で分け、root の auto 幅の table は列の和に縮む。
列の和より狭い table(内容で分け直す)と、auto 幅が container より広い区間(内容で縮む)は U_LAYOUT_TABLE。flex の中の auto 幅は Unknown。
UA の `table { border-collapse: separate; border-spacing: 2px }` は table 自身の規則で、親からは継承しない(以前は継承していた。root 以外の table で誤り)。
それ以外の table(内容で列幅が決まる自動レイアウト、中身のある rowspan、border か padding のある table の caption など)は Unknown。
`color-scheme` プロパティ:作者が書いた `Canvas`/`CanvasText` は要素の used color scheme で解決する(Chromium の dark は #121212/#fff)。
UA の既定色は ADR-0007 のまま Unknown。`light dark` を宣言した CSS も dark で再判定する。Vite の `meta name=color-scheme`(light 以外)は未対応として拒否する。th は UA の bold と中央寄せを持つので、作者が指定するまで未解決にする。
Chromium(このバージョン)は display を変えても table の role を保つことを確かめた(Safari は過去に失っていた)。
fieldset は UA の border・padding・margin・`min-inline-size` を reset する必要がある。最初の legend は border の中に描かれる
(rendered legend)。Chromium で測った規則をモデルにした:legend は border-left + padding-left の位置、block は max(0, (border-top − L)/2)、
fieldset の内容は max(border-top, L) + padding-top から始まる(L は legend の高さ)。legend は grid/flex の item にならない。
legend には display block・px の inline-size と block-size・block 方向と auto の margin なしを要求する(幅は shrink-to-fit なので)。
満たさなければ Unknown。`display: contents` の fieldset では legend は普通の box。
`display: contents` と `none` を領域で切り替える要素はサブセットの外なので、header を隠す場合は th 自体を隠す。

### inline 要素(文中のリンクなど)

text leaf の子が phrasing 要素(`a`・`span`・`strong`・`em`・`b`・`i`・`small`・`img`・`output`)だけなら、それらは leaf の **inline の内容** として扱う
(box tree の `inline`)。レイアウトの子にはしないので、leaf の寸法契約が内容全体の上界のままであるために次を要求し、満たさなければ Unknown:
`display: inline`・`position: static`・左右の padding・border・margin が 0、フォント由来の契約を持つ leaf ではフォントを変えないこと。
各 inline 要素は計算値と DOM の事実を持つ行(矩形なし)になり、名前・コントラスト・alt・フォーカスの規則の対象になる。

- 2.5.8 の inline 例外:文中の操作対象は target-size の対象外。
- 空の inline 要素は幅がないので、フォーカスできれば focus-area の違反(Chromium と一致)。
- リンクの UA スタイル:`a[href]` の色は UA のリンク色で、親から継承しない。以前は継承すると見なしていた(誤り)。
  作者が `color` を指定しない限りコントラストは Unknown。UA の下線(`text-decoration-line: underline`)はモデルにした。
- **inline の矩形**:一行(nowrap)の固定文字列の text 契約で `text.inline: {'.u': 'guide'}`(内容に1度だけ現れる部分)を与えると、
  フォント層が inline 要素の**外接**と**内接**の区間を測る:左右の端は接頭辞を単独で shaping した advance と、全体から残りを引いた advance の間
  (境界をまたぐ kerning はこの間にある)に layout allowance を足したもの、上下は font の content area(hhea、USE_TYPO_METRICS なら OS/2 typo)
  を行の中央に置いて ±1px(Chromium の ascent・descent の丸め)。engine は leaf の content box(text-align start、ltr)から矩形にし、
  report の `inlineBounds` に出す。inner に重なる後の箱は確実に覆う(E_A11Y_OCCLUDED)、outer だけに触れるなら U_A11Y_OCCLUDED、
  outer を含む箱は focus を完全に隠す(E_A11Y_FOCUS_OBSCURED)。Chromium の描画は日本語・Latin・行高が content area より小さい場合でも
  outer の中にあり inner を覆い(`e2e/layout-text-fonts.spec.mjs`)、3つの覆い方で hit test と一致した。
- **折り返す文字列**(`wrap: 'normal'`):greedy な改行は sweep の各区間 [最も広い行, w] で同じなので、区間ごとの改行位置が決まる。
  inline 要素はその区間で載る行と、行の中での位置(上と同じ測り方、上下は行番号 × line-height だけずらす)を持ち、engine は leaf の content 幅で
  region を分ける。行をまたいで分かれる区間には矩形を置かない(その幅では検査しない)。言語や閉じ括弧の trim で改行が揺れる文字列と
  `overflow-wrap: anywhere` は対象外。Chromium で 120〜900px を 13px 刻みで調べ、1行に載る幅では描画が outer に入り inner を覆い、
  矩形のない幅では実際に行をまたいで分かれていた。

### form control と画像

`img`・`input`・`select`・`textarea` を box tag に加えた。UA の固有寸法と padding はモデルにないので、button と同じく `appearance: none`・
`display: block` と reset を要求し、さらに `inline-size`(両軸の検査では `block-size` も)の明示を要求する。満たさなければ Unknown。
`width`/`height` 属性は presentational hint なので HTML adapter では未対応の属性(Unknown)のまま。
form field は操作対象として target-size・occluded-target・target-overlap・hidden-focusable・pointer-disabled の対象にもなる。

Chromium と照合して分かったこと:`display: none` の label は field の名前にならない(`aria-labelledby` は隠れた参照先の text も読む)。
label による名前は、label の text が描画され可視の領域だけで成立するとした。
また、2つの in-flow の block box が重なるとき、木の順で後の box が上に描かれ hit test を受ける(occluded-target と focus-obscured に追加)。

### 事実の出どころ

- **CSS**: `color`・`visibility`・`pointer-events`(継承)と `opacity` を計算値に保持するようにした(以前は装飾として捨てていた)。
  `background`・`background-color`・`background-image` は ADR-0012 で保持済み。幾何には使わない。
  `z-index` は未対応のプロパティのまま(使うと Unknown)なので、描画順は「positioned は in-flow の後、positioned 同士は木の順」で確定する。
- **DOM**: box tree に直接の静的テキスト `textContent`(template の式は `'dynamic'`)、`ariaLabel`・`href` の値、`alt`・`inputType`・`labelFor`・`placeholder`、`named`(空でない `aria-label`・`title`)、`labelledBy`、`references`、`ariaHidden`、`focusable`
  (`a[href]`、無効でない button、tabindex ≥ 0。tabindex < 0 は除く)、`tabIndex` を持たせた。
  HTML adapter と Isle template(IR)は同じ `accessibilityFacts` で属性から導き、動的な値は `'dynamic'` として Unknown の原因にする。
  `aria-labelledby` は参照先の subtree のテキストで名前になる(描画されない参照先も含む、accname 2.B)。
- **幾何**: 重なりは開区間で判定し(接するだけは重ならない)、両方の面積が正であることを要求する。

### text-contrast と ADR-0007

ADR-0007 の制約に従う。

- 背景は祖先を内側から辿り、最初の不透明な色までの半透明の層を合成する。`background-image`、`opacity < 1`、未対応の色の表記はUnknown。
- 黒い文字や白い背景を暗黙に補わない:作者が不透明な背景を宣言していなければ、文字色が UA 既定(`canvastext`)ならUnknown。
- 閾値との差が数値誤差の範囲(1e-9)ならUnknown。表示用に丸めた値では判定しない。
- 大きな文字の分類が確定しない(px 以外の `font-size`、UA の見出しの size)場合は通常文字の閾値を要求する。
- positioned な box が不透明な背景より内側にあり、祖先以外の塗りのある box と重なる(または位置が証明されない)場合、背後が祖先ではないのでUnknown。

色の表記は hex、`rgb()`/`rgba()`/`hsl()`/`hsla()`(カンマ区切りと空白区切り)、主要な named color、`transparent`、`currentcolor`(背景)。

## 範囲外

- `z-index`、`position: fixed/sticky`、`transform`、filter・blend、`color-scheme`・forced colors、`:focus` などの状態の擬似クラス。
- 名前の文字列の比較は `aria-label` と静的なテキストだけ(`aria-labelledby` の参照先の文字列は組み立てない)。動的なテキストは Unknown。
- inline 要素の位置と寸法(行への分割はモデルにない)。
- 2.5.8 の spacing 例外(24px の円の距離は線形でない)。target-undersized(ADR-0012)は spacing を考慮しない。
- Chromium 130 以降は focusable な子のない scroller を自動でフォーカス可能にする。scrollable-region-focusable は axe と同じ DOM の定義で判定する。

## 検証

| 検査 | 内容 |
| --- | --- |
| `packages/css-verifier/test/accessibility.test.mjs` | 64件(frame・media・字間を含む。focus・hover・text spacing を含む。ARIA の構造と値、page の規則、orientation を含む。テキストの比較を含む。table と fieldset を含む。inline の内容を含む。list・radio・landmark・role を含む。画像・form control・in-flow の覆いを含む。equivalent・essential・AAA を含む。円の近似が内側・外側で正しく、未決の帯が 0.05px 未満であることを含む)。各規則の違反・非違反・メディアクエリの区間、Unknown になる条件、HTML adapter の属性 |
| `tests/layout-accessibility.test.mjs` | Isle template の静的・動的な属性 |
| `tests/layout-build.test.mjs` | Vite の `layout.accessibility`:名前のない button で build が失敗し、証明書に契約が残る。title がない・zoom を禁じる viewport で失敗する |
| `e2e/layout-accessibility.spec.mjs` | 33構成を 1280/768/375px(reflow は 320/340/375)で Chromium と照合し、全規則で一致。名前は AX tree(CDP)、重なりと覆いは hit testing、フォーカスは `focus()`、順序は矩形、コントラストは計算値の色。1280px では `vlmkit check a11y contrast` とも一致 |

focus-visible と state-contrast は CDP の `CSS.forcePseudoState` で強制した状態の計算値(UA の focus ring を含む)、text-spacing は `line-height: 1.5 !important` を注入した `scrollHeight` と、字間・語間を付けた Chromium の行数(`e2e/layout-text-fonts.spec.mjs`)、hover-only は CDP で強制した `:hover`/`:focus` の opacity・visibility、autocomplete は Chromium の IDL 属性(不正な token は `''` に正規化される)、orientation は実際の viewport での計算値と照合した。
page の規則(html-lang など)は box tree の単体テストで検査する(eval は body の中の断片を描画する)。
結果は `evals/results/layout-accessibility/report.json` に残る。

## 次の段階

2. 内容で列幅が決まる自動 table レイアウトと、行の高さを決める rowspan。
3. inline 要素の幾何(位置と寸法。focus-obscured などの位置の規則を文中の要素に広げるため)。
