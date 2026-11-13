# ADR-0010: フォントから導出するテキスト寸法

- 状態: 実装中(1行のテキストと、固定文字列の折り返し)
- 日付: 2026-11-13
- Issue: 未作成
- 対応する提案: ユーザー指示「mizchi/font 0.8.0で文字列の幅・高さを計算し、満たすことを検査する」

## 背景

text leafの`minInlineSize`/`intrinsicBlockSize`は呼出し側が与える**trustedな前提**だった。
文字列とフォントが分かっていても、幅の根拠を検査器は持たず、
「マルチバイトを含むn文字以上で溢れる」ような条件を導けなかった。
CSSの`font-*`・`line-height`・`text-transform`は装飾として無視していた。

## 判断

契約・事実・証明義務を分ける。

- **契約**: 対象boxのフォント設定(family・size・line-height・weight)と、固定文字列、または文字集合と最大文字数。
- **事実**: [mizchi/font](https://github.com/mizchi/font) 0.8.0の`shape_text`(GSUB/GPOS、kerning・ligature有効)で求めたadvance。
  可変フォントではCSSの`font-weight`を`wght`座標に渡す。フォントのsha256・shaper名を出典に残す。
- **証明義務**: 導出した幅を`minInlineSize`、1行のline boxを`intrinsicBlockSize`として既存の領域・Z3検査へ渡す。
  コアは計算値のフォントが契約と一致することを検査し、一致しなければUnknownにする。

MoonBitのFFIはフォントの解析とshapingだけを持ち、丸め・定義域の上界・契約への変換はJS
(`packages/css-verifier/src/text.mjs`)、CSSとの照合はコア(`src/layout/text-font.mjs`)に置く。
FFIはbuild時専用で、アプリの配信runtimeには含めない。

### 丸め

Chromiumの幅はshapingのadvanceを1/64 px(LayoutUnit)へ切り上げた値になり、整数のadvanceでも
浮動小数の誤差で1単位増える場合がある。Chromiumは**script runごと**にshapingと切り上げを行うので、
固定文字列はChromiumと同じ規則でrunに分け(Script_Extensions:`ー`は{Hira, Kana}、CJKの約物は漢字・仮名のどれとも、
空白・数字・全角形はどのrunとも続く)、runごとにshapingした和をadvanceとする。runをまたぐkerningはない。
上界はk個のrunで「1/64 pxへ切り上げ、さらに(2k − 1)/64 px」とし、1/64 pxの倍数なので有理数として正確に扱える。
(当初は文字列全体を1回shapingしていたため、`日ーア`の`ーア`のkerningを落とし、`xyzABCxyz ぁ`ではChromiumが上界を2/64 px超えていた。)
runの分割は段落全体で行い、行はその切片として測る(行だけで分割すると、段落では`認 "`の`"`が漢字のrunに入るなどrunの数が変わる)。

内容の言語は`locl`で字形を変える(Noto Sans JPでは`ja`で`'`・`"`が広い:`it's`が21.96 → 22.375 px)。
文書の`lang`はモデルにないので、`und`・`ja`・`zh-Hans`・`zh-Hant`・`ko`の全てで測る。上界は最大値をとり、
行数profileは全ての言語(と閉じ括弧の詰め)で一致する幅だけ行数を持つ。どの文字・隣接対も`und`と同じ字形の言語は省く。
FFIの`shape`は言語を引数に取る。
文字集合と最大文字数の上界は全文字を最大advanceで数えるため、その余裕がrunごとの切り上げを覆う(Chromiumのランダム検査で確認)。

### 文字集合と最大文字数

各文字を単独で、全ての順序対を2文字でshapingし、1文字の最大advance `a` と隣接対の最大追加量 `k ≥ 0` を求める。
長さnの上界は `ceil64(n·a + (n−1)·k) + 1/64`。0..maxLengthの表を契約に持たせ、
反例のwitnessでは収まる最大文字数(`text.fitsUpTo`)を報告する。
3文字以上にわたる文脈依存のGPOS/GSUBは上界の外であり、前提として記録する。

### 行分割(固定文字列の折り返し)

`wrap: 'normal'`(または`'anywhere'`)と固定文字列の`text`契約は、行数のprofileに解決する
(`breakLines`、[`src/text.mjs`](../../packages/css-verifier/src/text.mjs))。

- **分割位置**: Chromiumで全ての順序対(約80文字の6400対)と空白をはさむ対を描画して確かめた規則。
  - 空白の後は常に分割できる(閉じ括弧の前でも)。
  - 漢字・仮名(小書き仮名と`ー`を含む)の前後で分割できる。
  - 全角の開き括弧`「『（［【〈《〔`の後では分割しない(行末禁則)。
  - 閉じ括弧`」』）］】〉》〕`、`、。，．・：；！？〜…‥`、繰り返し記号`々ヽヾゝゞ`の前では分割しない(行頭禁則)。
  - Latin文字・数字の連続の中では分割しない。開き括弧の前、閉じ括弧類の後では分割できる。
  - `lang`(en/ja/zh)で分割位置は変わらなかった。
  - **ASCII**: 2文字ともASCIIならChromiumは独自の対の表を使い(ICUではない)、文脈に依存しない。
    例外は1つで、`-`の後の数字の前は、`-`の前がASCIIの英数字のときだけ分割できる(`ABCD-1234`、`-1`は分けない)。
    ASCIIは15クラス(`!),.:;]}`、`"`、`#&*=>~`、`$`、`%`、`'`、`([{`、`+\`、`-`、`/`、数字、`<`、`?`、英字と`@^_\``、`|`)に分かれ、
    CJKの3クラス(開き・閉じ・漢字仮名)と合わせた18×18の表(`breakTable`)で全ての対が決まる。
  - 片方がASCIIでない対はICUが判定し、ほぼ対で決まるが、`$ % + \`(数値の接頭・接尾)がCJKの約物に隣接すると
    周囲の数字で変わる(UAX #14 LB25)。またLatin-1の文字とASCII記号の対はICUがASCIIの表と違う判定をする。どちらも入力エラー。
  - 対の表と例外規則は、全ての対(空白をはさむ場合を含む)とランダムな約10万文字列(`lang`がen・ja)を幅0で描画し、
    全ての分割可能位置が改行になることを使って照合し、不一致0件。`breakOpportunities`として公開し、e2eで毎回照合する。
- **text-spacing-trim**: Chromiumの既定(`normal`)はフォントの`halt`で約物を半角に詰める。shaperは`halt`を適用しないため、
  - 隣接する全角約物(`。」`・`」「`など)は詰められる(`。「`が24 px)。入力エラーにする。
  - 行末の閉じ括弧は、そのままでは収まらないとき半角になる(allow-end)。詰める場合と詰めない場合の両方で行数を求め、
    一致しない幅は行数なし(`lines: null`)とし、コアはその幅をUnknownにする。部分的な詰めは両者の間に入る。
  - 行頭の開き括弧と、句読点の行末は詰められなかった。
- **1行の判定**: 行の文字列(行末の空白は吊り下げ、幅に入れない)をshapingした上界が、利用できる幅以下なら収まる。
  1行のテキストと同じ規則である。
- **profile**: 上界は1/64 pxの倍数なので、greedyの結果は `[k/64, (k+1)/64)` で一定になる。
  最も広い行から1/64 pxずつ下へ進み、各greedyの「収まった行の最大上界」までが同じ分割である。
  行数ごとに最小の幅を残し、`intrinsicBlockSize`の段階profile(行数 × line-height)と、
  最長の分割不能な区間の上界を`minInlineSize`(min-content)にする。最大256段。
- **健全性**: 上界はadvance以上なので、モデルの各行はブラウザーの行より長くならず、行数はブラウザー以上になる。
  閾値の直下、幅(2k + 1)/64 px未満の帯(kはscript run数)ではモデルが1行多い場合があり、その帯では高さを大きめに見積もる。
- **overflow-wrap**: `anywhere`と`break-word`は、収まらない語を文字の間で分ける(1行に最低1文字)。
  1文字より狭い幅ではChromiumがligatureをまとめるため、profileは最も広い1文字の上界から始め、それより狭い幅はUnknownにする。
  `anywhere`ではmin-contentも最も広い1文字になる。
- **コアの照合**: `white-space: normal`、計測した`overflow-wrap`との一致、`intrinsicBlockSize`がprofile × line-heightであること
  (`textLinesMismatch`)。違反の反例には必要な行数と収まる行数(`text.lines`・`text.fitsLines`)が付く。
  integrityのtext-collisionでは、折り返すテキストはborder boxで判定する。

UAの見出し・強調のフォント(h1–h6のsizeとweight、strong/bのweight、em/iのstyle、smallのsize)は継承値ではなく
`ua`として未解決にし、作者のCSSで指定しない限りフォント由来の契約はUnknownになる(以前は継承値と見なしていた)。

## 範囲外(Unknownまたは入力エラー)

- 未収録グリフ(フォールバックフォント)、RTL、結合文字・ZWJ・絵文字・改行を含む文字集合。
- 文字集合と最大文字数の折り返し(分割位置が内容に依存する)、`white-space`がnormal・nowrap以外、`word-break`・`line-break`・`hyphens`・`text-wrap`(CSSで未対応のプロパティとして拒否)、上記以外の文字の行分割、小書き仮名・括弧の禁則、行頭・行末の約物の詰め。
- `font`shorthand、`line-height: normal`、px以外の`font-size`、UA既定のfamily・`medium`、
  `font-weight: bolder/lighter`、`text-transform`、`letter-spacing`/`word-spacing`、
  可変軸の範囲外のweight、静的フォントでの合成太字。
- 字形のink overflow、ヒンティング、Chromium以外のブラウザーの丸め。

## 依存関係と変更箇所

- FFI: `packages/css-verifier/text-metrics/`(`mizchi/font@0.8.0`、fixtureはOFLのNoto Sans JP/Robotoのsubset。
  `fixtures/sources.json`の元フォント・subset対象文字・pyftsubsetの指定から再生成できる。ASCII・仮名全体・全角約物を含み、旧fixtureの文字の幅は変わらない)。
- 導出: `src/text.mjs`、`src/text-node.mjs`(`@mizchi/css-verifier/text`、`/text/node`)。
- コア: `src/layout/css.mjs`(text系プロパティを継承付きで保持)、`text-font.mjs`、`engine.mjs`、`input.mjs`。
- Isle: CLIの`layout.json`の`fonts`、Viteの検査付きbuildの`layout.fonts`(`lib/layout-build.mjs`の`resolveCheckedLayout`)、`lib/layout-summary.mjs`の`text:`行。
  Viteではentryからの相対パスでフォントを読み、`text`契約をbuildStartで寸法契約へ解決する。フォントは監視対象になり、
  証明書`isle.layout.json`の`contracts.fonts`にfamily・相対パス・SHA-256を、`contracts.boxes`に導出した契約(`textMetrics`)を記録する。
  FFIはbuild時だけ読み込み、配信するJS/CSSは変わらない。

## 検証

| 検査 | 内容 |
| --- | --- |
| `packages/css-verifier/test/text-font.test.mjs` | 手書き契約でコアを単独検査。照合を外す変異で失敗することを確認 |
| `tests/css-text-metrics.test.mjs` | 丸め、空白の畳み込み、wght、上界表、拒否する入力、CLIの例 |
| `e2e/layout-text-fonts.spec.mjs` | Chromiumで同じフォントを描画。7文字列が`[advance, 上界]`、ランダム200文字列が上界以下、上界の余裕が2/64 px以下、例のcardが報告どおりの幅で溢れる。折り返し11構成(日本語・混在・Latin・括弧・小書き仮名・繰り返し記号、`anywhere`・`break-word`)と全クラスのランダム60文字列、ASCIIの語・記号とその日本語混在80文字列を`lang=en`/`ja`で描画し、行数がモデル以下、閾値直下の帯の外では一致(行数なしの幅は除く)。分割可能位置は全ての対と3000文字列を幅0で照合。[折り返しの例](../../examples/layout-contracts/text-wrap.json)のtitleの高さと、bodyが溢れる幅が一致 |

実行は`just css-text-check`。ブラウザーの実測は静的モデルの誤りを探す補助で、受理の判定には使わない。

## 次の段階

1. Isle adapterがtemplateの静的テキストを`content`として渡し、手書きの重複をなくす。
2. `halt`の適用(mizchi/fontのshapingにfeature指定が必要)による隣接約物の詰め、`$ % + \`とCJKの隣接(ICUの数値規則)、
   文書の`lang`を契約に持たせて言語ごとの不一致を減らすこと。いずれもChromiumで照合してから受理する。
   文字集合と最大文字数の折り返しは、行数の上界(高さの上界)として扱えるかを検討する。
3. フォント全体(cmap全体)を定義域とする上界。GPOSのpair調整の上限が必要になる。
