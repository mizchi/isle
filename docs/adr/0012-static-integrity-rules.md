# ADR-0012: vlmkit の integrity 検査を静的検査へ落とし込む

- 状態: 実装中(ボックスモデルの6規則、Vite と playground に接続)
- 日付: 2026-11-13
- Issue: 未作成
- 対応する提案: ユーザー指示「mizchi/vlmkit で検査しているボックスモデルの検査パターンを静的検査に落とし込む」

## 背景

`vlmkit check integrity` は、描画したページを 1280/768/375px で DOM と画素から判定する。
css-verifier はすでに border box の位置と寸法を viewport の affine 式として証明しているので、
同じ規則を特定の幅のサンプルではなく、宣言した viewport の全域で判定できる。

## 判断

`options.integrity`(`true` か `{targetSize, protrusion}`)で有効にする規則を追加する。既定では無効で、既存の結果は変わらない。
規則は `src/layout/integrity.mjs` にあり、engine が解いた幾何(矩形・領域)と、契約で免除した義務の破れだけを入力にする。

| vlmkit | 静的な規則 | 判定 | 重大度 |
| --- | --- | --- | --- |
| `page-overflow-x` | `E_LAYOUT_PAGE_OVERFLOW` | clip / scroll の祖先を持たない box の右端 > viewport 幅 | error |
| `container-protrusion` | `E_LAYOUT_PROTRUSION` | 子の border box が親の padding box を出る(absolute は除く) | error |
| `text-collision` | `E_LAYOUT_TEXT_COLLISION` | テキストの描かれる範囲どうしの開区間の交差。absolute の box が関わる場合は免除として記録 | error |
| `target-undersized` | `E_LAYOUT_TARGET_SIZE` | button / a の幅か高さが `targetSize`(既定24px、WCAG 2.2 SC 2.5.8)未満 | error |
| `clipped-content` / `text-clipped` | `W_LAYOUT_CLIPPED` | 契約が許した溢れが、overflow hidden / clip の container で実際に切れる | 警告 |
| `nested-scroll` | `W_LAYOUT_NESTED_SCROLL` | 実際にスクロールする box の中で、内側の box もスクロールする | 警告 |

各結果は区間・witness・`rule`(vlmkit の規則名)を持つ。警告は `report.integrity.warnings` にあり、status を変えない。
矩形を持たない box(clip / scroll の祖先の内側、位置を出さない区間)は位置の規則の対象外とする。
ブラウザーでも、切られた内容はページ端に届かない。自身の overflow は自身の border box を動かさないので、自身の矩形は使う。

既存の義務(ITEM_SIZE・TRACKS・CONTENT)と重なる場合がある。integrity の規則は、契約で溢れを許した場合も報告する点と、
vlmkit と同じ単位(ページ・親子・テキスト)で結果を示す点が異なる。

## 塗りのある親に限る(`protrusion: 'painted'`)

既定の `'all'` は全ての親を対象にする。`'painted'` は vlmkit と同じく、border(幅 > 0)か背景
(`background-color` が透明以外、または `background-image`)を持つ親だけを対象にする。
塗りの判定のため `background`・`background-color`・`background-image` を計算値に保持する(幾何には使わない)。
色の値が透明と判定できない場合は塗りありとして扱い、検査を減らさない側に倒す。

## Z3・Vite・playground

integrity の違反は checks の義務ではないため、Z3 のモデルにはその違反区間が空でないことの確認として入れる。
playground の状態表示(Z3 由来)と Vite の検査付き build は、同じ違反で失敗する。
Vite では `layout.integrity` を渡す。違反は build エラー、警告は Vite の警告になり、`isle.layout.json` の
`contracts.integrity` と `report.integrity` に記録する。playground は **Integrity · page overflow, protrusion & 24px targets** の preset と、
状態行の「integrity N errors, M warnings, K exempted」で確認できる。

## テキストの範囲

フォントから導出したテキスト契約(ADR-0010)を持つ leaf は、描かれる1行の範囲で判定する。
横は導出した幅の上界を `text-align`(start / left / justify は行頭、center、end / right)で置き、
縦は内容 box の上端から1行の line box。入りきらない行は CSS Text 3 §6.1 により行頭寄せになるので、
「内容幅 ≥ 上界」の区間だけ揃えを適用する。文字集合の契約では、上界以下の全ての文字列の配置の和集合が同じ区間になる。
box 自身が overflow を切る場合は padding box との共通部分にする。1次元の区間の共通部分は全ての対が交わるときに限り空でない(Helly)ので、
両方の範囲と切り取りの区間の全ての対の交差を条件にする。契約のない text は border box で判定する(安全側)。

vlmkit と同じく、absolute の box が関わる重なりは意図的なオーバーレイとして `report.integrity.exempted` に理由付きで残し、エラーにしない。

## vlmkit との違い

- vlmkit は4px未満のはみ出しを雑音として報告しない。静的な規則は有理数で正確に判定し、閾値を持たない。
- フォント契約のない text は border box で判定するので、vlmkit(文字の範囲)より多く報告する。
- vlmkit は一方の文字範囲がもう一方を完全に含む組を入れ子とみなして除外する。静的な規則は除外しない。
- vlmkit の `container-protrusion` は塗りのある親に限る。静的な規則は全ての親を対象にする。
- 色・遮蔽(paint 順)・近接ずれ・JS や資源の失敗は対象外。

## 検証

| 検査 | 内容 |
| --- | --- |
| `packages/css-verifier/test/integrity.test.mjs` | opt-in、契約で溢れを許した行のページ溢れと突出の正確な閾値、absolute のラベルの衝突、24px の target、clip と入れ子スクロールの警告 |
| `e2e/layout-integrity.spec.mjs` | 8構成を vlmkit 0.24.0 で 1280/768/375px に検査し、規則ごとに静的な区間と一致することを確認。免除は両側で検出として数え、vlmkit の text-clipped は clipped-content として扱う。フォント契約のあるテキスト(Roboto subset)は text-collision も一致を要求し、契約のない text は「vlmkit が報告するなら静的も報告」のみ |

結果は `evals/results/layout-integrity/report.json` に残る。

## 次の段階

1. フォント由来のテキスト契約を Vite の build から使う(`layout.json` の `fonts` に相当する設定)。
