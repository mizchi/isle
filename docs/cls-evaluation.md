# CLS を事前に計算して最適化するための評価と分類

これまでに実装した静的検査(レイアウトの検証・integrity・accessibility の規則とエンジンの機能)を、
**CLS(Cumulative Layout Shift)を事前に計算し、最適化できるか**という目的で評価し直す。
CSS アニメーション、`img`/`picture` の大きさとフォールバック、カルーセルを重点として扱う。
アクセシビリティの観点の分類は [accessibility-rule-evaluation.md](accessibility-rule-evaluation.md) にある。この文書は CLS の軸で分類する。

## 何が CLS になるか(Chromium で測定)

CLS は Layout Instability API の `layout-shift` エントリーの合計で決まる。
1つのエントリーの値は「影響した領域の割合 × 移動した距離の割合」である。
直前に離散的な入力(click・keydown・tap)があった場合は `hadRecentInput` が付き、CLS から除かれる。
下の表は [e2e/layout-cls-facts.spec.mjs](../e2e/layout-cls-facts.spec.mjs) で固定した測定結果である(800×600、入力なし)。

| 変化 | layout shift | 値(この構成) |
| --- | --- | --- |
| `transform` のアニメーション(translateY 0→100px、0.5s 無限) | なし | 0 |
| `margin-top` のアニメーション(0→100px、0.5s 無限) | 毎フレーム | 1.5 秒で 0.15(48 件) |
| `:hover` で高さが変わる | あり(`hadRecentInput` は false) | 0.003 |
| 大きさのない `img` の読み込み完了 | あり | 0.0065 |
| `width`/`height` 属性のある `img` | なし | 0 |
| `picture` の `source` に `width`/`height` がない(`img` と比が違う) | あり | 0.0075 |
| `source` に `width`/`height` がある | なし | 0 |
| inline の `img` に `alt` があり、読み込みに失敗する(大きさを指定していても) | あり。alt の text の箱(60×18)になる | 0.0065 |
| 同じ失敗で `display: block` | なし。指定の大きさを保つ | 0 |
| カルーセル:scroll-snap の `scrollTo` で送る | なし | 0 |
| カルーセル:トラックを `transform` で送る | なし | 0 |
| カルーセル:トラックを `margin-left` で送る | 毎回 | 2 秒で 0.19 |
| カルーセル:高さの違うスライドを `display` で切り替える | 下の内容が動く | 2 秒で 0.015 |

ここから導ける判断軸は次の4つである。

- **配置の位置だけが問題になる。** transform・opacity・塗りの変化とスクロールは CLS にならない。
- **hover は入力として除外されない。** hover が配置を変えると、そのまま CLS に数えられる。
- **画像は大きさの予約で決まる。** `width`/`height` 属性、`aspect-ratio`、`source` ごとの寸法のどれかがあれば予約される。
- **失敗時の代替表示も予約の一部である。** inline の `img` は、失敗すると alt の text に置き換わり、指定した大きさを捨てる。

## 既存の仕組みの位置づけ

| 仕組み | CLS との関係 | 状態 |
| --- | --- | --- |
| `noshift/1`([layout-transitions.md](layout-transitions.md)) | 2つの状態で、対象の位置と大きさが viewport の全区間で一致することを証明する。CLS = 0 の部分的な十分条件 | 実装済み。transform とアニメーションは Unknown |
| 動的な寸法の契約(ADR-0003) | 内容が変わっても箱が変わらない範囲を宣言して検査する | 実装済み |
| 非同期の予約領域(ADR-0004) | 読み込み中と完了後の箱を一致させる。画像の予約と同じ考え方 | 実装済み |
| key の世代と frame の遷移(ADR-0005) | 起こりうる隣接 frame を列挙する | 実装済み |
| CLS の値と上限(ADR-0001 M2・M3) | 面積 × 距離の score と、時間の窓で集計した上限 | 未実装 |

## 規則とエンジン機能の分類(CLS の軸)

### C1. CLS を直接予測・防止する

shift の有無や大きさを決める情報である。CLS の最適化に直接使える。

- **`noshift/1`、ADR-0003〜0005:** 既存の中核。
- **状態による配置の変化**
  - `:focus` で配置が変わる場合の配置し直し(今回追加):
    - Tab によるフォーカスは keydown なので CLS から除外される。
    - script による `focus()` は除外されない。
    - 配置し直しの仕組みは、そのまま「focus で shift するか」の判定に使える。
  - `:hover` で配置が変わる規則は、今は分析全体を Unknown にしている。測定では hover は CLS に数えられるので、これは **CLS の候補として報告すべき**誤りである(提案 H)。
- **transform を配置の変化として扱わないこと**(今回の拡張):
  - 状態の規則とアニメーションの transform は、配置を変えないものとして扱う。
  - 測定のとおり transform は CLS にならないので、`noshift` でも transform を無視できる。今の `noshift` は transform を Unknown にしているが、ここを緩められる(提案 T)。
  - 90° 以外の回転(外接長方形)も、配置には影響しない。
- **アニメーションの解析**(`flash`・`motion` のために `@keyframes` の中身と `animation-direction` を読むようにした):
  - 今は塗り(背景色・不透明度)だけを読んでいる。
  - 配置のプロパティを読むようにすれば、アニメーションによる CLS の計算の土台になる(提案 A)。
- **`position: fixed`・`sticky` のモデル化:**
  - スクロールで画面に貼り付く動きは CLS にならない。
  - なので「動いて見えるが CLS ではない」ことを正しく区別できる。

### C2. CLS の証明が届く範囲を広げる(配置の精度)

それ自体は shift を測らない。ただし、これまで Unknown だったページの配置を厳密に決めるので、`noshift` などの証明をより多くのページに適用できる。

- `max-width`(px と %)、flex の子要素の max、`max-height`
- 内容で列幅が決まる auto テーブル(px の列が混ざるものと、内容に縮むものを含む)
- rowspan の積み重ね(px の要素、計測した text、入れ子の grid、flex、px の行の grid)
- 右から左に書くヘブライ文字の幅と折り返し
- ブラウザ標準のチェックボックスとラジオの 13px の大きさ、UA の margin
- 当たり判定を広げる疑似要素の配置(block 要素の葉の絶対配置の `::before`/`::after`)

### C3. CLS と無関係(アクセシビリティの意味論)

CLS の計算にも最適化にも寄与しない。アクセシビリティの検査として価値がある。

- コントラスト系:`text-contrast`・`state-contrast`・`focus-contrast`・`field-boundary`・`placeholder-contrast`・`checked-indicator`
- 名前と ARIA の規則
- 操作対象の大きさ:`target-size` と user agent control の例外
- 画面外・隠れの規則:`focus-offscreen`・`text-obscured`・`fixed-hides-content`・`fragment-under-bar`・`focus-scrolled-under`・`focus-clipped-away`
- 時間と表示の規則:`flash`・`visual-presentation`

`fragment-under-bar` と `focus-scrolled-under` はスクロールの位置を扱うが、スクロールは CLS ではないので CLS とは無関係である。

## 重点テーマ

### A. CSS アニメーション

**今の状態**

- `@keyframes` から読むのは背景色と不透明度だけで、配置のプロパティのフレームは読んでいない。
- `noshift` は、アニメーションを保証しないと明記している。

**提案**

1. **プロパティで分ける。**
   - `transform`・`opacity`・`filter`・色は CLS 0 と証明できる。
   - `top`/`left`・`margin`・`padding`・`width`/`height`・`inset`・`font-size` などの配置のプロパティを含むアニメーションは、CLS の候補である。
2. **フレームごとに配置を計算する。** 各 keyframe の値で配置し直し、要素とその後ろの要素の移動量と影響した領域を求める。`:focus` の配置し直しと同じ仕組みを使う。
3. **上限を求める。** 連続した動きでは、各フレームの値の合計は、影響した領域 × 移動した総距離 ÷ viewport の大きさで上から抑えられる。これを Chromium の集計の窓(最大 5 秒、間隔 1 秒)で集計する。無限に繰り返すアニメーションは窓の上限まで増える。これは ADR-0001 の M2・M3 に当たる。
4. **最適化の提案を出す。** 同じ見た目になる transform への書き換え(`margin-top` → `translateY`)を、反例に添えて示す。

### B. 画像(`img`・`picture`)

> **実装済み(B1・B2):**
>
> - `img` の `width`/`height` 属性を、ブラウザと同じく幅と高さの既定値、および `aspect-ratio: auto w / h` として扱う。CSS の `aspect-ratio` も扱う。幅が決まれば、高さを比で計算する。6 つの書き方の大きさが、3 つの幅で Chromium と一致した。
> - 静的な画像の大きさを、`images` option(`{src: {width, height}}`)で渡せる。ファイルの header から大きさを読む `lib/image-size.mjs`(PNG・GIF・JPEG・WebP・SVG)を追加した。
>   - 大きさを予約していない `img` は `E_LAYOUT_IMAGE_UNRESERVED` になる。読み込み後の配置はファイルの比で計算し、加えるべき `width`/`height` を示す。
>   - 予約した比がファイルと違う `img` は `E_LAYOUT_IMAGE_RATIO` になる。
>   - ファイルの大きさが分からない予約なしの `img` は Unknown になる。
>   - 3 つの変種で、静的な判定と Chromium の CLS の有無が一致した。
> - Isle の template 言語はまだ `img` を扱えない。そのため、この検査が届くのは HTML の解析(`analyzeHTML`)だけである。build への接続は、言語が `img` に対応してから行う。

**今の状態**

- `img` は、CSS で幅と高さの両方を px で指定したときだけ扱える。
- HTML の `width`/`height` 属性、CSS の `aspect-ratio`、`picture`/`source`、`srcset` は、分析に渡っていない。

**提案**

1. **`width`/`height` 属性を比として扱う。** 属性を `aspect-ratio: auto w / h` の既定値として扱い、CSS の `aspect-ratio` も受け付ける。幅が一次式で決まれば、高さは幅 ÷ 比で一次式のまま計算できる。
2. **静的な画像の比をファイルから読む。** ビルド時に、リポジトリ内の画像ファイル(Vite の asset)の縦横の画素数を読み、`src` の比として使う。
   - 属性がない場合:比を補って検査できる。ビルドで `width`/`height` を自動で挿入する最適化も示せる。
   - 属性がある場合:ファイルの比と食い違えば、読み込み後に高さが変わるので CLS の候補として報告する。
   - 外部 URL や動的な `src` の画像は比が分からないので、属性か契約がなければ予約なし(CLS の候補)として報告する。
3. **`picture` は media ごとに比を求める。** `source` の `media` 条件は既存の media の区間分けで扱える。区間ごとに選ばれる `source` の `width`/`height`(または静的ファイルの比)から高さを求める。寸法のない `source` が選ばれる区間は、CLS の候補として報告する。
4. **失敗時の代替表示を検査する。** inline の `img` に `alt` があると、失敗時に text の箱になり、予約が消える。`display: block` にするか、外側の箱で大きさを予約するよう提案する。`alt=""` の場合と block の場合は大きさを保つ。
5. **遅延読み込み:** `loading="lazy"` は、予約が正しければ CLS に影響しない。予約の検査と同じ判定でよい。

### C. カルーセル

**今の状態**

- 横方向の scroll container と `transform` は扱える(transform はアクセシビリティの検査だけ)。
- スライドの状態(何枚目か)を列挙する入口は、Isle の状態の列挙(ADR-0005)にある。

**提案**

1. **送り方を分類する。**
   - scroll-snap と `transform` のトラックは CLS 0 と証明できる。
   - `margin`・`left`・`width` を動かす送り方は、CLS の候補として報告し、transform への書き換えを提案する。
2. **スライドの高さの独立性を検査する(最も効果が大きい)。** どのスライドを表示しても、カルーセルの箱の高さが同じかを `noshift` で検査する。全スライドの高さが同じか、箱の高さが固定(px・`aspect-ratio`)であれば、カルーセルの後ろの内容は動かない。高さが違うスライドを `display` で切り替えると、測定どおり後ろの内容が動く。
3. **初期化の前と後を検査する。** JavaScript がカルーセルを初期化する前の初期表示(全スライドが縦に並ぶなど)と初期化後の状態を、`noshift` の2つの状態として比べる。
4. **スライド内の画像:** スライドごとの画像の予約(B)と組み合わせる。見えていないスライドの遅延読み込みは、予約が正しければ CLS にならない。

## 優先順位

効果と実装の大きさから、次の順で進めるのがよい。

| 順 | 提案 | 理由 |
| --- | --- | --- |
| 1 | ~~B1・B2~~ 実装済み(Isle の template への接続は `img` の対応待ち) | 画像は CLS の最大の原因である。比は一次式に収まる。ビルドでの自動挿入という最適化に直結する |
| 2 | T:`noshift` で transform を無視する | 測定で裏付けがある。transform で送るカルーセルとアニメーションをすぐ証明可能にする |
| 3 | C2・C3:カルーセルの状態ごとの高さと、初期化前後の `noshift` | 既存の `noshift` と状態の列挙の組み合わせで済む |
| 4 | H:配置を変える `:hover` を CLS の候補として報告する | `:focus` の配置し直しを流用できる |
| 5 | B3・B4:`picture` の media ごとの比と、失敗時の代替表示 | media の区間分けと、要素の種類の規則で済む |
| 6 | A:配置のアニメーションの score の上限(ADR-0001 M2・M3) | score は非線形なので、上界の設計が要る。最も大きい |
