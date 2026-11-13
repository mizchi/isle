# ADR-0012: vlmkit の integrity 検査を静的検査へ落とし込む

- 状態: 実装中(ボックスモデルの6規則)
- 日付: 2026-11-13
- Issue: 未作成
- 対応する提案: ユーザー指示「mizchi/vlmkit で検査しているボックスモデルの検査パターンを静的検査に落とし込む」

## 背景

`vlmkit check integrity` は、描画したページを 1280/768/375px で DOM と画素から判定する。
css-verifier はすでに border box の位置と寸法を viewport の affine 式として証明しているので、
同じ規則を特定の幅のサンプルではなく、宣言した viewport の全域で判定できる。

## 判断

`options.integrity`(`true` か `{targetSize}`)で有効にする規則を追加する。既定では無効で、既存の結果は変わらない。
規則は `src/layout/integrity.mjs` にあり、engine が解いた幾何(矩形・領域)と、契約で免除した義務の破れだけを入力にする。

| vlmkit | 静的な規則 | 判定 | 重大度 |
| --- | --- | --- | --- |
| `page-overflow-x` | `E_LAYOUT_PAGE_OVERFLOW` | clip / scroll の祖先を持たない box の右端 > viewport 幅 | error |
| `container-protrusion` | `E_LAYOUT_PROTRUSION` | 子の border box が親の padding box を出る(absolute は除く) | error |
| `text-collision` | `E_LAYOUT_TEXT_COLLISION` | テキスト leaf の border box どうしの開区間の交差 | error |
| `target-undersized` | `E_LAYOUT_TARGET_SIZE` | button / a の幅か高さが `targetSize`(既定24px、WCAG 2.2 SC 2.5.8)未満 | error |
| `clipped-content` / `text-clipped` | `W_LAYOUT_CLIPPED` | 契約が許した溢れが、overflow hidden / clip の container で実際に切れる | 警告 |
| `nested-scroll` | `W_LAYOUT_NESTED_SCROLL` | 実際にスクロールする box の中で、内側の box もスクロールする | 警告 |

各結果は区間・witness・`rule`(vlmkit の規則名)を持つ。警告は `report.integrity.warnings` にあり、status を変えない。
矩形を持たない box(clip / scroll の祖先の内側、位置を出さない区間)は位置の規則の対象外とする。
ブラウザーでも、切られた内容はページ端に届かない。自身の overflow は自身の border box を動かさないので、自身の矩形は使う。

既存の義務(ITEM_SIZE・TRACKS・CONTENT)と重なる場合がある。integrity の規則は、契約で溢れを許した場合も報告する点と、
vlmkit と同じ単位(ページ・親子・テキスト)で結果を示す点が異なる。

## vlmkit との違い

- vlmkit は4px未満のはみ出しを雑音として報告しない。静的な規則は有理数で正確に判定し、閾値を持たない。
- `text-collision` は、vlmkit がテキストの glyph の範囲、静的な規則が border box で判定する。静的な結果は安全側に多い。
- vlmkit の `container-protrusion` は塗りのある親に限る。静的な規則は全ての親を対象にする。
- 色・遮蔽(paint 順)・近接ずれ・JS や資源の失敗は対象外。

## 検証

| 検査 | 内容 |
| --- | --- |
| `packages/css-verifier/test/integrity.test.mjs` | opt-in、契約で溢れを許した行のページ溢れと突出の正確な閾値、absolute のラベルの衝突、24px の target、clip と入れ子スクロールの警告 |
| `e2e/layout-integrity.spec.mjs` | 6構成を vlmkit 0.24.0 で 1280/768/375px に検査し、規則ごとに静的な区間と一致することを確認。text-collision は「vlmkit が報告するなら静的も報告」のみ |

結果は `evals/results/layout-integrity/report.json` に残る。

## 次の段階

1. テキストの glyph の範囲(ADR-0010 のフォント導出)で text-collision を絞る。
2. 塗り(背景・border の有無)を CSS から求め、protrusion を vlmkit と同じ対象に絞る選択肢。
3. Vite の検査付き build と playground への接続。
