# ADR-0011: flex と display: contents の安全なサブセット

- 状態: 実装中(row/column・nowrap の flex、正の min の凍結、scroll container の item、contents。wrap は未着手)
- 日付: 2026-11-13
- Issue: 未作成
- 対応する提案: ユーザー指示「grid/flex や contents のサブセットで動かし、徐々に安全に書ける範囲を増やす」

## 背景

検査器は子を持つ container に Grid を要求し、`display: flex` を `E_LAYOUT_CONTAINER` の違反、
`display: contents` を未対応にしていた。flex は一般には内容サイズ・縮小・min/max の凍結を含み、
有限な affine 式で表せない。

## 判断

flexible length algorithm([css-flexbox-1 §9.7](https://www.w3.org/TR/css-flexbox-1/#resolve-flexible-lengths))が
凍結を起こさない item だけを受理する。この範囲で item の外側サイズは container の幅の affine 式になる。

- container: row、nowrap、`justify-content` は normal / flex-start / start、全 item の order 0。
- 固定 item: grow 0、shrink 0、basis が px(width auto と明示 min-width)、または `auto` と px の width。
  外側サイズは basis(content-box なら padding/border を加える)。余白が負なら縮まずに溢れ、TRACKS の義務が失敗する。
- 伸縮 item: grow > 0、basis 0、width auto、`min-width: 0`。外側サイズは padding/border + 正の余白 × grow / max(1, Σgrow)。
- 定義済みの高さを持つ単一行 container の行はその高さ(§9.4 step 15)。item は stretch / normal で伸長する。
- 空の box の自動最小サイズは0として扱う。内容を持つ box の `min-width: auto` は内容に依存するので unknown。

既存の Grid の列配分・行・子の解決を再利用し、flex の item 列を1行の track として渡す。
Grid の配置プロパティは flex item に適用しない。

### 正の min と凍結

伸縮 item の外側の最小サイズ(content-box なら padding/border を加えた min)を持たせ、
行の解決では §9.7 の凍結を有限の場合分けとして再現する。各段階で未凍結の item の取り分を affine 式で求め、
正の min を持つ item ごとに「取り分 ≥ min」で領域を分割する。下回る item を全て min に凍結し
(min のみなら違反の総和は常に正)、残りの余白を未凍結の item に配り直す。凍結は解除されないので item 数+1段で終わる。
凍結後に未凍結の grow の和が1未満になると初期余白に係数を掛ける規則(§9.7 step 4b)が絡むため、
正の min がある行では伸縮 item の grow を全て1以上に限る。column では `min-height` に同じ規則を使う。

### overflow

`overflow` が visible / clip 以外の item は scroll container であり、自動最小サイズは0(§4.5)。
`overflow: hidden` を `min-width: 0` の代わりに使う書き方を受理する。`clip` は scroll container ではないので内容に依存する。
item 内の溢れは item の box 契約の overflow 方針、行の溢れは container の方針で照合する。
片方の軸が visible / clip 以外なら他方の visible は auto に計算される点も、既存の計算値規則のとおり扱う。

### column

主軸は block 軸。交差軸の幅は全 item が container の内容幅へ伸長する(normal / stretch のみ)。
item は固定(grow 0・shrink 0、basis px か `auto`+px の height)、伸縮(grow > 0、basis 0、height auto、`min-height: 0`)、
内容サイズ(grow 0、basis auto、height auto)。block の内容高さは min-content = max-content なので、
内容サイズ item の flex base size と自動最小サイズは一致し、縮小も凍結も起きない。高さは既存の行の測定(`intrinsicBlockSize`、子の解決)で求める。
item を1列の行 track とし、定義済みの高さでは固定・内容サイズを差し引いた余白を伸縮 item へ配る。
高さが未定の column は item の合計高さになり、伸縮 item は内容から伸びるため unknown にする。幅だけの解析では全 item に内容幅を渡す。

`display: contents` は子を親の item に置き換える。継承は要素の木に従い、contents 要素の style を親として子を計算する。
text(匿名 box)、契約・noshift の対象、解析 root、領域で変わる contents は unknown。

外れた入力は `U_LAYOUT_FLEX`(flex)または `U_LAYOUT_GEOMETRY`(contents)の unknown であり、違反と推測しない。

## mizchi/css

差分検査を flex 系プロパティへ広げ、mizchi/css 0.8.1 の誤りを3件見つけて mizchi/css の branch で修正した。
`flex: <basis> <grow>` 等の順序と単位なし0の扱い・不正値の parse 時破棄、`flex-basis: content`、`flex-flow` の省略側。
修正は0.8.2としてリリースされ、差分検査は0.8.2を固定して flex 系を既定で比較する。

## 検証

| 検査 | 内容 |
| --- | --- |
| `packages/css-verifier/test/flex-contents.test.mjs` | 固定+伸縮、比の配分と padding、Σgrow < 1、固定 item の溢れ、サブセット外10種の unknown、交差軸の伸長、contents の平坦化と継承 |
| `e2e/layout-flex.spec.mjs` | 13構成(column 3件、凍結3件、scroll container 1件を含む)×4 viewport で、モデルの矩形(位置・寸法)が Chromium と1/64 px以内で一致。伸縮 item の padding を落とす変異、column で border を落とす変異、凍結を無効にする変異を検出 |
| `evals/scenarios/layout-rejections` | `flex` の例を「初期値の item → U_LAYOUT_FLEX、伸縮 item に書くと verified」へ更新 |

## 次の段階

1. `justify-content` の他の値(位置のみ変わる)、`flex-wrap` は行分割の場合分けが必要。
