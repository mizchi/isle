# 静的検査規則の評価と分類

ADR-0012(integrity)と ADR-0013(accessibility)で実装した規則を、有用さで分類する。
Chromium との照合(e2e 113 構成)で示せるのは、規則が**ブラウザと同じ答えを出すこと**だけである。
規則が**役に立つか**は示せない。そこで、ここでは次の4つの軸で評価する。

| 軸 | 問い |
| --- | --- |
| CSS 依存 | 答えが CSS の結果(配置・塗り・可視性・状態)に依存し、DOM だけでは決まらないか |
| 既存ツールとの差 | axe-core(実行時、1 viewport・1 状態)や DOM/JSX lint(eslint-plugin-jsx-a11y、html-validate)で既に取れるか。取れる場合も、viewport の区間全体や hover・focus・dark などの状態で**証明**できる点に差があるか |
| 誤検知 | 正当な設計を誤りと報告する余地。ヒューリスティックか、WCAG の達成基準そのものか |
| 頻度 | 実際のサイトでよく起きる誤りか。WebAIM Million の上位は低コントラスト、alt の欠如、form の label の欠如、空のリンク・ボタン、lang の欠如 |

## A. 中核:この検査器でしか取れない(既定で有効、エラー)

CSS の結果に依存し、viewport の区間全体と状態のすべてで判定できる。
axe が同じ観点を持つ規則でも、axe は開いた1つの幅・1つの状態しか見ない。ここが最も大きな差である。

| 規則 | 理由 |
| --- | --- |
| text-contrast / state-contrast / link-in-text-block | 頻度は1位。祖先の背景の合成、hover・focus、dark scheme を、区間全体で扱える |
| target-size / target-overlap / occluded-target | 2.5.8 の spacing 例外を幾何で判定する。重なりと覆いは配置と stacking に依存する |
| reflow / page-overflow-x / container-protrusion / text-collision / clipped-content | 320px での溢れ、区間内のどこかの幅だけで起きる衝突。スクリーンショットの検査では取り逃しやすい |
| text-obscured / flash / fragment-under-bar / focus-clipped-away / checked-indicator / placeholder-contrast / field-boundary / focus-contrast / visual-presentation(AAA) / fixed-hides-content / focus-scrolled-under / focus-offscreen / focus-obscured / focus-clipped / focus-transparent / focus-visible / focus-area / hidden-focusable | フォーカスが見えない・届かない誤り。sticky header に隠れる、`overflow: clip`、opacity 0、outline を消す、など。どれも CSS でしか決まらない |
| hover-only / pointer-disabled | 状態のセレクタと継承した `pointer-events` に依存する |
| scrollable-region-focusable / text-spacing | 溢れの証明に依存する。axe は実際に溢れた1つの幅しか見ない |
| accessible-name / form-label / label-in-name / empty-heading / empty-th / icon-font-name / generated-name | 頻度は上位。`display:none` や `visibility:hidden` の文字、生成コンテンツ、アイコンフォントで名前が消えたり偽物になったりする。lint はこれを CSS 抜きでしか見られない |
| hidden-overridden / state-mismatch / modal-background / fragment-target / orientation | DOM の意図(hidden、aria-expanded、aria-modal、#id)と、CSS の結果が食い違う。lint にも axe にもない、または1状態しか見ない |
| multiple-main / heading-order(区間ごと) | メディアクエリで描画が入れ替わる区間ごとに判定できる |

## B. 有用だが DOM だけで決まる(既定で有効、安い build gate)

属性の文法や木の構造の誤りで、axe や lint と重複する。
ここで持つ利点は次の3点に限られる。

- Isle の build を失敗させ、証明書に残せる。
- 「描画される要素だけ」に絞れる。
- 動的な属性を Unknown として扱える。

実装は小さく誤検知もほぼないので残す。ただし、これらが価値の中心ではない。

duplicate-id, aria-reference, role-valid, role-parent / role-children, role-attr, aria-attr / aria-value, presentation-conflict, nested-interactive, interactive-role-focusable, positive-tabindex, image-alt, input-button-name, input-image-alt, label-for, td-headers, table-headers, scope, autocomplete, html-lang / lang-valid, document-title / meta-viewport, frame-title, video-caption, list-structure, definition-list, error-message, native-aria-conflict, focus-semantics

## C. ヒューリスティック:正当な設計も報告しうる(警告のまま。既定から外す候補)

WCAG の達成基準そのものではなく、達成方法(Technique)や推測に基づく。
誤りの可能性を示すにすぎず、修正を強いる根拠にはならない。

| 規則 | 誤検知の例 |
| --- | --- |
| visual-order | grid-area で sidebar を左に置くなど、意図した並べ替え。1.3.2 が問題にするのは意味が順序に依存する場合だけ |
| p-as-heading | 強調のための太字の段落、リード文 |
| link-text / link-purpose / new-window | 文脈で目的が分かるリンク(2.4.4 は文脈を許す)。new-window は G201 の推奨にすぎない |
| redundant-alt / title-only | 冗長でも違反ではない |
| form-submit | Enter や script で送信する検索欄、自動保存の設定画面 |
| clickable-look | `cursor: pointer` を label や装飾に付けた場合。click handler が木の外にあるので確かめられない |
| list-style-semantics | WebKit/VoiceOver 固有の挙動。意図的に list と読ませない設計もある |
| small-text | 対応する達成基準がない |
| region / bypass / page-h1 / page-main / landmark-name / landmark-top-level / duplicate-landmark / radio-group / fieldset-name | ベストプラクティスの範囲。部品単体の検査では文脈が足りない |
| motion / autoplay-audio | 停止の手段(ボタン)が script 側にある場合を見られない |

## D. 価値が低い(稀、または時代遅れ)

実際のコードではほぼ起きない。
コストは小さいので削除はしないが、規則の一覧が長くなり、価値の中心が見えにくくなる。

| 規則 | 理由 |
| --- | --- |
| blink | `marquee` は廃止された要素で、新しいコードにはまず現れない |
| server-side-image-map | `img ismap` は事実上使われない |
| accesskeys | accesskey 自体がまれ |
| aria-hidden-body | Chromium は body の aria-hidden を無視する。UA による差を知らせるだけ |

## 次の一手(提案)

1. ~~profile を設ける~~ 実装済み。`accessibility: {profile: 'core'}` は A と B だけを出す。既定の `'all'` は従来どおり全規則を出す(既定を変えるかは未決)。どの profile でも、各行に `tier`(`core` / `dom` / `heuristic` / `legacy`)が付く。分類の表は `packages/css-verifier/src/layout/accessibility.mjs` の `tierLists` にある。
2. A の各規則について、実在のサイトを模した構成での検出数と誤検知数を測る。今の e2e は規則ごとに作った最小構成なので、頻度と誤検知率は測れていない。axe-core との重複の実測(同じ構成で axe を走らせて突き合わせる)も、このとき行う。
3. 今後の規則の追加は A の性質(CSS の結果に依存し、区間や状態で証明できるもの)に絞る。B〜D に当たるものは lint に任せる。
