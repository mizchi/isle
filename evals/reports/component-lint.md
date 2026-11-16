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

## 次の課題(backlog)

- (解決済み) canvas の色が分からないときのコントラストの Unknown は、既定の色の仮定(light の preference)で検査できるようになりました。dark の preference での canvas は、Chromium が #121212 にするので、まだ Unknown です。
- 位置指定された箱で、自分の不透明な背景を持たないものは、後ろの箱が祖先ではないので、コントラストが Unknown のままです(固定サイドバーの例)。
- `{expression}` のテキストは、`data-text-max-length` がないと寸法が仮定のままです。adapter がテンプレートの型(props の文字列の長さ)を読めれば、属性なしで済みます。
- inline-block の行レイアウトはモデル外です(chips の before)。
- 次に加える例: フォームの検証メッセージ、モーダル、タブ、カルーセル、RTL。
