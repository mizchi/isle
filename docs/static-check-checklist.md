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
  0.25px 以内で届くことを確かめた。flex の項目の `max(0px, calc(…))` の幅はまだ配置が Unknown。

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
- [~] **D2. flex の項目の `%` 幅と、`vw`・`em` の長さ**: `em` の長さと、縮まない(か min-width のある)flex の項目の `%` の幅は済み。
  block flow の中の `%` の高さ(親が高さを宣言しているとき。px でも vh でもよく、min/max で詰めたあとの内容の高さに対して)と、
  その高さでの px と % を混ぜた `calc()` も済み(3 つのブラウザーで、2 つの viewport の高さで位置と高さが一致)。
  flex の項目の `vw` の幅と `calc()`(px・%・vw・vh の和)の幅や basis も済み: `%` の basis と同じく、容器の内容の幅に対する
  viewport の式として解く(縮まないか、伸びるだけの場合。縮む項目どうしの重みが 1 つの幅の割合にならない場合は Unknown)。
  3 つのブラウザーで、2 つの viewport の幅で一致。flex の column の `%` の高さ、grid の `%` の行、auto の高さの親の中の `%` の高さ
  (grid の項目として伸ばされる親を含む)、flex の項目の `min()`/`max()` の幅は残り。
- [ ] **D3. inline の中の行の配置**: 文字の行と inline の箱の位置。大きい。

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

## 済み(このチェックリストを作る前に済んだもの)

- [x] easing の行き過ぎ(cubic-bezier、`linear()`)の極値でのシフト検査と CLS の上限、終わりの戻り、relative のオフセット、
  複数のアニメーションの並び、同じ区間で一緒に動くプロパティ、`rem` の補間
- [x] `@property`、`@scope`(`to` を含む)、入れ子の CSS、`@supports`(表)、`@starting-style`(描画だけ)、`@namespace`
  (接頭辞付きと、SVG のないページの XHTML)、`@counter-style`、`@font-palette-values`、`@charset`、`@page`、`@view-transition`
- [x] `translate`・`rotate`・`scale` のプロパティ、回転角の `turn`・`grad`・`rad`
- [x] `W_CSS_IMPORT_IGNORED`、`W_CSS_KEYFRAME_IMPORTANT`、`W_CSS_FONT_NO_GENERIC`、inline の箱の `transform`
