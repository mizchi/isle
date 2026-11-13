# 静的UI検証の方針

採用方針: ブラウザーで描画せず、閉じたCSS部分集合の静的モデルで検査する。
レスポンシブな入力領域と動的要素の取り得る範囲を明示し、まずモデル化できる
範囲に保証を限定する。検査器は一般のCSS検証ライブラリとし、Isleは利用者の一つにする。

## 現在の実装境界

[`packages/css-verifier`](../packages/css-verifier/README.md) に幾何解析・CSS解析・
契約IR・Z3検証を移した。仮の名前は `@mizchi/css-verifier`。privateな試作で、
npmレジストリには未公開。入力はCSS、汎用box tree、viewport範囲、祖先・
内容寸法・scrollbarの前提。静的HTML fragmentをbox treeに変換する入口もある。
Isleの構文、コンパイラ、ProgramIR、ブラウザー描画器には依存しない。

```text
Isle AST ── Isle adapter ──┐
静的HTML ── HTML adapter ─┼─ box tree + CSS + environment ─ LayoutIR
別のUI言語 ─ adapter ──────┘                                  │
独立したContractIR ──────────────────────────────── ObligationIR ─ Z3
```

Isle側にはテンプレート展開、有限なShow/Forや状態の候補列挙、scoped CSSの収集、
ソース宣言の変換、配信HTMLとCSSの照合を残す。一般のライブラリにIsleの状態や
イベント文法を持ち込まない。別adapterも、入力構造と候補の被覆に責任を持つ。

既存の `@isle/prototype/layout*` は互換入口として同じコアを呼ぶ。Isleの既存の
単一アーカイブ配布を維持するため、現段階ではその配布物にも同じコアのソースを
同梱する。独立パッケージからIsleを逆参照しない。将来レジストリへ公開する際に
通常のパッケージ依存へ切り替えられる。検査データもZ3もアプリruntimeへ出力しない。

## 何を保証するか

CSS全体を再実装するのではなく、選択したprofileの意味論に対する全称検査をする。
同じ入力構造について、宣言されたviewport範囲のすべての点と、到達可能な
media/container条件の組合せを検査する。代表的な画面幅だけを試す検査とは区別する。
有理数・区分線形の領域を使い、境界の一点や小数幅の反例も残す。

現在の保証はGridの寸法・overflow適合と、SafeGrid / PositionedGridの契約。
モデル化したreset、padding、border、gap、subgrid、scrollbar、局所absoluteの
意味も検査する。ブラウザーのpixel丸め、ink overflow、任意のフォント計測は対象外。
検査器の実装自体がCSS仕様に健全であるという機械証明は、まだ提供していない。

結果は `verified` / `violated` / `unknown`。未対応機能、入力の不足、上限超過や
solver timeoutを成功へ寄せない。厳格なビルドは `verified` だけを受け入れ、
不正な入力や上限の例外でも停止する。報告された仮定を満たすことが保証の条件になる。

## 動的要素と仮定

幅だけでは一般の動的UIを記述できない。今後の共通入力モデルでは、inline/blockの
範囲、幅に依存する高さ、個数、有限なclassや状態、テキスト・フォントの境界、
入力同士の相関を扱う。到達不能な直積を作る場合は保守的な過大近似と明示する。

現行APIの `minInlineSize` / `minBlockSize` は内容を収めるのに十分な寸法として
信頼する前提。`intrinsicBlockSize` は正確なauto-heightまたは幅別の高さprofile。
任意の最大・最小サイズ区間を解釈する一般の動的寸法モデルは、まだない。

将来は境界ごとに、静的に導出した `inferred`、入力検証で確立した `validated`、
外部から信頼する `trusted` の由来を記録する。現時点の外部寸法は `trusted` として
reportのassumptionsに残す。与えられた数値そのものを検証済みとは呼ばない。
保証したい述語を実装モデルへ前提として追加することも禁止する。

## 状態遷移契約とCLS

各候補のfitとは別に、[`noshift/1`](layout-transitions.md)のAPIを独立コアへ実装した。
具体的な二状態を入力し、明示的に対応付けたboxの存在・root基準のborder矩形が、
同じviewport領域のすべての点で変わらないことを検査する。矩形被覆と等価性を別queryにする。

IsleではDOM側の`@noshift`を基本にし、`ensures { noshift ".action"; }`も外部・集約指定として
提供する。DOM注釈はclass名に依存しないsource-site IDへlowerし、汎用コアはbox treeの
target IDだけを扱う。keyによる同一性が未確定の反復要素はUnknownにする。
既存の抽象解釈で列挙した有限な候補をadapterで比較する。候補は到達状態の過大近似になり得るため、候補間のすべての移動を禁止する
強い契約になる。列挙や対応付けが不完全ならUnknownにする。汎用コアは具体case同士の比較に
限定し、列挙・被覆の責任をadapterへ残す。一般の予約領域・scroll位置・内部anchor契約は未実装。
外枠の固定だけで内部の移動まで証明したことにしない。画像・フォント・非同期データも
可能な寸法と遷移が閉じてから対象にする。

静的検査は、条件付きの「モデル上の移動なし」を扱う。ブラウザーのCLS値を
直接保証するものとは呼ばない。CLSには観測時刻・ユーザー操作・viewport・
移動の集計規則が関係する。コントラストやfocus等も別の述語群とし、未解決の描画
要因を含む場合はUnknownにする。現行コアにこれらの保証はない。

## 検査器をどう確かめるか

一般ライブラリ単体のテスト、独立npmアーカイブの利用、Isle adapterとの同値性、
境界・反例・Unknownの回帰を検査する。`just css-verifier-check` で実行できる。
ブラウザー実測は、CSS意味論の取り違えを探す差分evalとして併用できる。
ユーザーのソースに対する検証成功を決める手続きにはブラウザーを使わない。
