# コンポーネント lint 評価の結果

対象は [component-lint の評価](../scenarios/component-lint/README.md) の 8 例です。Svelte 4 例、Vue 2 例、Linaria 1 例、StyleX 1 例で、そのうち 1 例は崩れのない対照、1 例は表現できない書き方の例です。Chromium での実測を正解とし、lint の検出と照合しました。

## 検出(before)

| 段階 | Chromium で見えた崩れ | lint が検出 | 見逃し | 確認できない error |
|---|---|---|---|---|
| 最初の実行 | 9 | 2 | 7 | 1 |
| h1–h6 を bold として測る | 9 | 3 | 6 | 1 |
| `display: block` の a を折り畳まない | 9 | 6 | 3 | 1 |
| grid の `align-items` / `align-self` | 9 | 9 | 0 | 2 |
| 評価器の修正(反例の幅を描く、縦のはみ出し) | 9 | 9 | 0 | 0 |

見逃しの原因は、ルールの不足ではありませんでした。テキストやレイアウトがモデルに入らず Unknown になり、そのため検査が走っていませんでした。Unknown の理由を集計した表(`backlog`)が、そのまま直す順番になりました。

1. **見出しのテキストを測っていなかった**(3 例)。UA の `font-weight` を `ua` のまま残していたため、h1–h6 は測ったフォントと一致せず、仮定の寸法になっていました。HTML の描画規則と Chromium では h1–h6 と th は `bold` なので、700 として解決するようにしました。strong/b は親に対する `bolder` なので、`ua` のままです。
2. **`nav > a { display: block }` をテキストの葉として扱っていた**(固定サイドバーの例)。子が 1 つの block container を、子の computed display を見ずに折り畳んでいました。そのため nav のフォント(medium)で検査され、Unknown になり、サイドバーが覆う検査が丸ごと止まっていました。子が `display: inline` のときだけ折り畳むようにしました。
3. **grid の `align-items: center` が Unknown だった**(3 例: カートのボタン、検索欄、対照)。よく書かれる指定です。grid item の block 軸の自己整列(start、center、end と、その flex-*/self-* の別名)を、item の高さを保って空きの割合だけずらす形でモデル化し、Chromium の矩形と照合しました(`e2e/layout-flex.spec.mjs`)。baseline は Unknown のままです。

## 修正ループ(attempts)

| run | 崩れ | 検出 | 見逃し | 確認できない error | 問題なし |
|---|---|---|---|---|---|
| before | 9 | 9 | 0 | 0 | 2/8 |
| run-1(警告と fix に従って直した) | 1 | 1 | 0 | 0 | 7/8 |
| run-2 | 0 | 0 | 0 | 0 | 8/8 |
| run-3 | 0 | 0 | 0 | 0 | 8/8 |

- **run-1**:
  - サイドバーの例は「本文をサイドバーの幅だけずらす」に従って `padding-left: 200px` を足しました。すると幅 320px で本文が 88px しか残らず、"Install"(88.66px)がはみ出しました。lint はこれを `E_LAYOUT_CONTENT` として出し、Chromium でも 0.66px はみ出しました。直した結果、新しい崩れが生まれ、それも検出できたことになります。
  - chips の例は、inline-block を flex に変えたところで別の Unknown に止まりました。動的なテキスト(`{tag}`)の幅が決まらないためです。メッセージは max-content の契約を求めていました。
- **run-2**:
  - サイドバーは、狭い幅で `position: static` に戻しました。今度は `top`/`left` が効かないという警告(`W_LAYOUT_DECLARATION_INERT`)が出ました。正しい警告です。
  - chips には `data-text-max-length="16"` と `nowrap` を付け、検査できるようになりました(16 文字までのどの文字列でも収まる)。
- **run-3**: `position: fixed` を `@media (min-width: 768px)` の中へ移しました。8 例とも error と warning が 0 で、Chromium でも崩れはありません。

## 形式化の情報は改善に役立ったか

- **役立ったこと**:
  - Unknown の理由に、検査できる形への書き換え方が書かれていました(例: 「inline-level の chip の行レイアウトはモデル外。display: block にするか、親を grid/flex に」)。作者は止まらずに先へ進めました。
  - 反例の幅(「at viewport 552px」)から、Chromium で確かめる幅が決まりました。固定の 4 幅だけでは見えなかった 552px での崩れも確認できました。
  - 仮定(16px の既定フォントサイズ、2 倍での再解析、測ったテキストの数)が毎回 info に出るので、何が保証の範囲外かが読めました。
- **直したこと**:
  - lint の出力に分数(`22065/64px`)と内部の目印(`.__ph0`)が出ていました。小数の px にし、目印は取り除きました。
  - 一つの原因が何件にも分かれていました。tracks のはみ出しの中の 5 個の箱が、それぞれ `E_LAYOUT_PAGE_OVERFLOW` を出していました。固定バーが覆う例でも、同じテキストに `E_A11Y_TEXT_START_OBSCURED` と `E_A11Y_FIXED_HIDES_PART` の二つが出ていました。いちばん外の箱の一件にまとめ、「(also: 5 boxes inside it …)」と書き添えるようにしました。
  - 評価器そのものの誤りも見つかりました。scrollWidth は整数に丸められるので、0.66px のはみ出しが見えていませんでした。縦方向のはみ出しも測っていませんでした。
- **Chromium の実測では確かめていない検出**: カートのボタンのコントラスト 3.05:1(#fff の上に #0a5)は、lint だけが出しました。ここでの描画の照合では判定していません(コントラストのルールは、別の e2e で axe と照合しています)。

## 2 回目のループ: 例を 12 に増やした

表(Svelte)、sticky のヘッダー(Vue)、16:9 のサムネイルのカードの grid(StyleX)、ダークモードのバナー(Linaria)を加えました。

| 段階 | 崩れ | 検出 | 見逃し | 確認できない error |
|---|---|---|---|---|
| 4 例を加えた直後 | 11 | 10 | 1 | 2 |
| `border-collapse: collapse`(枠線なし)と表の自動の列幅 | 11 | 11 | 0 | 2 |
| 評価器: overflow で隠れた中身、テキストのコントラスト(ライト/ダーク) | 15 | 15 | 0 | 0 |
| 既定の色の仮定(`defaultColors`)を入れたあと | 15 | 15 | 0 | 0 |

- **表**:
  - `border-collapse: collapse` は、それだけで Unknown になっていました。表、行グループ、行、セルのどこにも枠線がなく、表に padding もないときは、`border-spacing: 0` の分離モデルと同じ箱になります。Chromium の矩形で確かめ、そのとおりモデル化しました。
  - 次は自動の列幅で止まりました。フォントファイルから測ったテキストに max-content の幅(`maxInlineSize`)を足すと、既にある内容の大きさの列のモデル(`-isle-auto-table`)で解けました。
  - fix の文言が grid 向け(「minmax(0, 1fr) にする」)だったので、表には「セルを折り返す、または overflow-x: auto のラッパーでスクロールさせる」と出すようにしました。
- **sticky のヘッダー**: `top` のない sticky(`W_LAYOUT_STICKY_NO_INSET`)と、固定の高さで隠れる 2 行目のタイトル(`E_LAYOUT_TRACKS`)の二つが出ました。評価器が overflow で隠れた中身を測るようにして、Chromium でも確認できました。
- **ダークモード**: dark の preference でだけ文字色が背景と同化するもの(1.38:1)を、lint は `(prefers-color-scheme: dark)` 付きで出していました。評価器がダークの描画でコントラストを測るようにして、確認できました。
- **既定の色の仮定**:
  - backlog のいちばん上は「文字色が UA の既定(canvastext)」「どの祖先にも不透明な背景がない」で、20 件ありました。ページが dark の color-scheme を宣言せず、light の preference なら、Chromium は白い canvas に黒い文字を描きます(スクリーンショットで確かめた)。これを仮定として明示し、info に出すようにしました。`--default-colors none` で外せます。ADR-0007 の「暗黙の黒と白はない」は、呼び出し側が述べる仮定として守っています。
  - 測ったところ、dark の preference では、color-scheme を宣言しないページでも、Chromium は canvas を #121212 にし、canvastext は黒のままでした。そのため dark の状態では仮定を置かず、Unknown のままにしました。
  - 評価器は、このダークの canvas とのコントラスト不足を、コンポーネントの崩れとは別の「環境依存」(14 件)として数えています。実際のブラウザーでダークの OS がこの描画になるかは、まだ確かめていません。

修正版(run-1 に追加)は、warning と fix の文言どおりに直しました(nowrap を外す、`top: 0` を足して高さの固定を外す、`auto-fill` にする、dark の色を指定する)。4 例とも、1 回で error と warning が 0 になり、Chromium でも崩れはありません。

## 3 回目のループ: 16 例

フォームの検証メッセージ(Svelte)、モーダル(Vue)、タブ(StyleX)、RTL のカード(Linaria)を加えました。

| 段階 | 崩れ | 検出 | 見逃し | 確認できない error |
|---|---|---|---|---|
| 4 例を加えた直後 | 19 | 19 | 0 | 1 |
| 評価器: 横スクロールできない画面外のテキスト | 21 | 21 | 0 | 0 |

- **止まっていた書き方**:
  - grid の中で幅が auto のテキスト入力欄が Unknown でした。Chromium で測ると、grid item では列の幅まで伸び(368px の列で 368px)、block flow では固有の幅(195px)のままでした。grid item の場合だけ div と同じように伸ばすモデルにしました。block flow は Unknown のままです。
  - StyleX の `borderWidth: 0` が出す `border-width: 0` も Unknown でした。0 の `border-width` は border-style によらず枠線なしなので、扱うようにしました。0 でない値は border-style しだいなので Unknown です。
- **直した版で見つかった誤報と、表現できない書き方**:
  - タブの行は、fix に従って `overflow-x: auto` にしても、`E_LAYOUT_TRACKS` が出たままでした。コアは、スクロールの意図を契約(`overflow: 'scroll'`)で宣言させる設計です。そこで、CSS の overflow auto/scroll をその意図とみなすオプション `scrollIntent: 'css'` を足し、コンポーネントの lint だけが使うようにしました(コアの既定は変えていません)。`overflow: hidden` で中身が切れる場合は、今までどおり報告します。
  - モーダルは、fix に従って `minmax(0, 480px)` にしたところで、その track が Unknown になりました。`minmax(Apx, Bpx)` は、base が A、growth limit が B の track です。fr の track より先に空きを受け取り、B を超えては伸びません(Chromium の矩形で確かめた)。そのとおりモデル化しました。
- **fix の文言**: flex の行のはみ出しに grid の文言が出ていました。今は「item を縮める(flex-shrink: 1、min-width: 0)、折り返す(flex-wrap)、行をスクロールさせる」と出ます。
- **評価器**: モーダルは `position: fixed` の中ではみ出すので、ページは横にスクロールせず、ダイアログの両端は手の届かない画面外にありました。これを測るようにしました。スクロールコンテナの中の画面外と、`overflow: auto` のスクロールは、崩れに数えません。

## 4 回目のループ: 20 例

カルーセル(Svelte)、ナビゲーションのドロワー(Vue)、トースト(StyleX)、ソートできる表の見出し(Linaria)を加えました。

- **ルールはあったのに出ていなかったもの**: 閉じたドロワーのリンクは、transform で画面外にあるのに Tab でフォーカスを受けます。これは `E_A11Y_FOCUS_OFFSCREEN` として検出できていましたが、Chromium と照合していなかったので recommended の外にあり、lint では info でした。そこで Chromium で照合しました。Tab で各リンクにフォーカスし、見えるかどうかを測って、-100%、-50%、none の三つの位置で静的な判定と一致することを確かめ、recommended に入れました。
- **仕込んだ崩れの誤り**: トーストの例は、最初はページがビューポートより短く、実際には何も隠れていませんでした。lint も Chromium も崩れなしで、一致しています。ページを長くして崩れが本当に起きるようにすると、`E_A11Y_FIXED_HIDES` が出ました。
- **直した版で見つかった誤報 2 件**:
  - トーストの修正(StyleX で `padding` に `paddingBottom` を足す)で、`E_CSS_SHORTHAND_CONFLICT` が出て解析が止まっていました。StyleX では longhand が shorthand に必ず勝ちます(実際の StyleX のビルドと Chromium で、両方の順序を確かめた)。adapter は、その longhand を特定度の高い二つ目の rule に出すようにしました。
  - 解析が止まって配置がないことを、live region が描画されていないと取り違え、`W_A11Y_LIVE_HIDDEN` を出していました。ページが配置された範囲でだけ判定するようにしました。
- **止まっていた書き方**:
  - ソートボタンを入れたセルの自動の列幅が Unknown でした。px の幅の空の block が一つだけのセルは、その幅が min-content と max-content になります。そのとおりモデル化し、Chromium と照合しました。
  - カルーセルの `flex: 0 0 100%`(パーセントの flex-basis)は、まだモデル外です。メッセージで、px の basis か grid に書き換える方法を示します。before の 2 例の見逃し(カルーセルのボタンがテキストに重なること、ソートボタンに名前がないこと)は、どちらもこの Unknown のせいです。どちらも Unknown として info に出ているので、黙って合格にはしていません。
- **評価器**: ボタンとリンクの名前を測るようにしました。`visibility: hidden` の要素は、画面外の判定から外しました。
- **配置によらない名前の検査**:
  - レイアウトが Unknown のときは、配置を使う accessibility の検査がすべて止まっていました。そのため、表の中のソートボタンに名前がないことを見逃していました。
  - そこで、マークアップだけで名前を判定するようにしました。対象は、テキストも、画像のテキストも、名前の属性もないボタンとリンクです。どの CSS rule もそれを隠せない(display: none、visibility、content-visibility)、生成テキストも付けられない(content)、祖先が accessibility tree から外していない、という場合だけ出します。
  - Chromium の accessibility tree の名前と、7 通りの書き方で一致しました。before の見逃しは 1 件(カルーセル、パーセントの flex-basis の Unknown のせい)になりました。

## 5 回目のループ: 24 例

パンくずリスト(Svelte)、ページネーション(Vue)、アコーディオン(StyleX)、日付の入力(Linaria)を加えました。

- パンくずリスト(nowrap の flex の行のはみ出し)、アコーディオン(コントラスト不足と、固定の高さで切れる回答)は、最初から検出できました。
- ページネーションには、仕込むつもりのなかった崩れがありました。幅 60px で nowrap と `overflow: hidden` の「Next page」は、63.19px 要るので末尾が切れます。lint が先に見つけたので、case.json を実態に合わせました。
- **止まっていた書き方**: `type="date"` の入力欄が Unknown でした。Chromium で測ると、date、time、datetime-local、month、week は、テキストの入力欄とまったく同じ箱でした(content-box で、作者の幅と高さに従い、中身より小さくもなる)。そのため、テキストの入力欄として扱うようにしました。color は border-box なので、外したままです。
- 修正版は、4 例とも fix の文言どおりに 1 回で直りました(flex-wrap、幅の固定を外す、色と高さ、1 列に積む)。

## 6 回目のループ: カルーセルの見逃し

- **パーセントの flex-basis**:
  - 伸びも縮みもしない item(`flex: 0 0 P%`)を、1 行の flex の行で扱うようにしました。大きさは、container の内容の幅の P%(content-box なら edges を足す)で、ビューポートについて affine です。
  - item の最小(padding と border、または中身の min-content)がそれを超えうる範囲は、ブラウザーが最小を使うので Unknown にしました。折り返す container では行の分け方が定数を要るので、Unknown のままです。
  - Chromium の矩形で照合しました。Chromium はパーセントを 1/64px に切り捨てるので、照合の例は割り切れる幅にしてあります。モデルは厳密な値で、端数で 1/64px 未満ずれることがあります。
- **`flex: 1`(0% の basis)と `min-width: auto`**: 同じ変更で、中身の min-content を自動の最小として使うようになりました(CSS Flexbox §4.5)。今まで Unknown だった書き方で、Chromium と一致しました。中身が `minmax(0, 1fr)` の grid だと min-content は 0 で、Chromium でも item は縮み、中身がはみ出します。モデルはこれも正しく error にしました。
- **黙って通っていた見逃し**:
  - カルーセルを解析できるようになったところで、スクロールコンテナの中のテキストは位置が決まらない(スクロール量による)ため、覆いの検査から info もなしに外れていたことが分かりました。
  - スクロールコンテナの外の不透明な箱が、その上に描かれて重なる範囲では、`U_A11Y_SCROLLED_COVER`(検査していない)を出すようにしました。
  - 評価器も、見逃しのうち、その例の lint の結果が Unknown でもなかったもの(`silentMissed`)を分けて数えるようにしました。

## 7 回目のループ: 28 例

検索の候補(combobox、Svelte)、ツールチップ(Vue)、ファイルの選択(StyleX)、価格のスライダー(Linaria)を加えました。

- **最初から検出できたもの**:
  - 候補の一覧がページの外へはみ出すこと。
  - 半透明の背景のツールチップのコントラスト(1.83:1)。
  - `display: none` の file input をラベルだけで開く作り(`E_A11Y_CONTROL_HIDDEN`)。
- **止まっていた書き方**: `type="range"` が Unknown でした。Chromium で測ると、range は content-box で、UA の padding と border はなく、margin は四辺とも 2px でした。作者の幅と高さはどんな値でもそのまま使われ、grid item で幅が auto なら列まで伸びました。これをモデル化し、矩形で照合しました。
- **誤報**:
  - 位置指定された親より背の高い absolute の一覧が、`E_LAYOUT_ITEM_SIZE` になっていました。ドロップダウンが短い入力欄の下に垂れるのは普通のことで、それだけでは何も隠れません(切り取りとページのはみ出しは別に検査している)。そこで、位置指定された祖先と初期の containing block に対しては、block 方向の大きさの検査をしないようにしました。fixed でビューポートより高い箱は、今までどおり報告します。
  - 検査を「緩める」(waive する)方法は、状態遷移(noshift)の profile が拒むので使いませんでした。
- **評価器**: ラベルが見えているコントロールに Chromium の `focus()` でフォーカスが入るかを測るようにしました。箱のラベルも、lint と同じく id を優先するようにしました。
- **修正のループ**:
  - ファイルの選択は 3 回かかりました。run-1 で sr-only にすると、file input の UA の箱が分からないので Unknown になりました。run-2 で、メッセージに従って appearance と edges をリセットすると、位置指定された祖先がない(`W_LAYOUT_ABSOLUTE_PAGE`)、inset がない(Unknown)と出ました。run-3 でそれも直すと、問題がなくなりました。
  - どの段階でも、出たメッセージどおりに直せば次へ進めました。

## 8 回目のループ: 32 例

ステップの進捗表示(Svelte)、星の評価(Vue)、チャットの吹き出し(StyleX)、比較表(Linaria)を加えました。

- **最初から検出できたもの**:
  - 固定の列のステップ表示のはみ出し。
  - 星のボタンの名前がないこと。
  - 星のボタンが小さすぎること(`E_A11Y_TARGET_SIZE`)。
  - 表の見出しのコントラスト(2.61:1)。
- **止まっていた書き方(チャット)**:
  - 吹き出しの `p` は `display: grid` で、中身はテキストだけでした。このテキストは grid の無名の item になり、Unknown でした。`minmax(0, 1fr)` の 1 列で、row の track もなく、item と内容の整列もなければ、その item は内容の箱いっぱいに伸びて、テキストの高さの行になります。block のテキストの葉と同じなので、そう扱うようにしました(Chromium の矩形で照合した)。表示を置き換えたことで出ていた「grid-template-columns が効かない」という誤った警告も、出ないようにしました。
  - 自分の吹き出しの `justify-self: end` も Unknown でした。grid item の justify-self の start、center、end をモデル化しました。px の幅の item はそのまま、幅が auto のテキストの葉は fit-content の幅(min(max-content, max(min-content, area))、px の max-width で上限)になり、area の空きのその割合だけずれます。Chromium は area より広い item も unsafe に揃えるので(end で 200px の area に 300px の item は −90px)、空きが負でもそのままずらします。px の幅は矩形で照合しました。fit-content の幅は、実際のフォントで描いた右端と一致し、モデルの箱が描いた箱を含む(測った幅の上界の分だけ広い)ことを確かめました。
- 修正版は、4 例とも fix の文言どおりに 1 回で直りました(flexible tracks、名前と 24px、overflow-wrap: anywhere、コントラスト)。

## 9 回目のループ: 36 例

カレンダーの月表示(Svelte)、通知バッジ付きのアイコン(Vue)、サイドバーの開閉(StyleX)、フォームのエラーの要約(Linaria)を加えました。

- **最初から検出できたもの**:
  - 7 列の固定の列のはみ出し。
  - 狭いレールにしたときの nowrap のリンクのはみ出し(collapsed=true の状態だけ)。
  - 固定の高さで切れるエラーの要約。
- **止まっていた書き方**: 子が absolute のバッジだけのボタンを、テキストの葉として折り畳んでいたため、ボタンの UA のフォントで検査され、Unknown になっていました。折り畳む条件に、子が流れの中(position: static で float なし)にあることを足しました。これでバッジのコントラスト不足(2.28:1)が出るようになりました。
- **仕込んだ崩れの誤り**: バッジのボタンには「3」というテキストがあるので、名前はあります(「3」です)。名前がないという想定は誤りで、lint の判定が正しかったので、case.json を直しました。
- 修正版は、4 例とも 1 回で直りました。サイドバーは、畳んだときにラベルを視覚的に隠しています(sr-only)。
- **評価器の誤り**: その sr-only のラベル(1px の箱で overflow hidden、clip-path)を、評価器が「テキストがはみ出す」「切れる」と数え、黙った見逃しが 3 件に見えていました。意図して視覚的に隠した要素(lint と同じく、読まれるが見えない)を、崩れの測定から外しました。

## 次の課題(backlog)

- (解決済み) canvas の色が分からないときのコントラストの Unknown は、既定の色の仮定(light の preference)で検査できるようになりました。dark の preference での canvas は、Chromium が #121212 にするので、まだ Unknown です。
- 位置指定された箱で、自分の不透明な背景を持たないものは、後ろの箱が祖先ではないので、コントラストが Unknown のままです(固定サイドバーの例)。
- `{expression}` のテキストは、`data-text-max-length` がないと寸法が仮定のままです。adapter がテンプレートの型(props の文字列の長さ)を読めれば、属性なしで済みます。
- inline-block の行レイアウトはモデル外です(chips の before)。
- (一部解決) パーセントの flex-basis は、伸び縮みしない item の 1 行の flex で扱えます。折り返す flex と、伸び縮みする item は Unknown です。
- スクロールコンテナの中の位置(スクロール量 0 のときの位置を、スクロールの範囲とあわせて扱う)。今はその中のテキストが覆われるかを検査できません。
- (解決済み) 名前の検査は、レイアウトが Unknown でも、マークアップだけで判定できる場合は出します。コントラストや覆いのように配置が要る検査は、Unknown のままです。
- 次に加える例: 料金のトグル、商品の画像ギャラリー、コメントのスレッド、設定の切り替えスイッチ。
- 色だけで状態を示すこと(ステップの現在地)は、検査するルールがありません(WCAG 1.4.1)。
- RTL の例では、物理方向の指定の警告は出ますが、Chromium では崩れが見えません(アイコンとテキストが反対側に離れるだけ)。警告の意図(読む方向に合わない配置)を、どう実測するかは未定です。
