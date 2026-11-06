# 制御構文の初期実装と検証

2026-11-05。対象は [実行できる fixture](../scenarios/control-flow/fixture.isle)。resource / inline / union を含む fixture.isle.next は引き続き全体設計の読解用であり、実装済みとは扱わない。参加者を使った記述・読解評価は今回実施していない。

MoonBit frontend に Select / Each / Boundary、boolean 演算、閉じた record / array の型検査を追加した。まず parser / 型と SSR の受入テストが失敗することを確認し、生成器と runtime を実装した。全 arm の検査後に定数分岐を除去する。source DSL の handler の契約は従来どおり state への代入に制約し、任意 TS の実行は追加していない。

Region backend は各 block の HTML factory と部分更新関数を生成する。ブラウザへ template AST を送らず、初期 DOM と新しい detached fragment のハンドルを一度解決する。同じ arm / key では DOM を保持し、index と行の捕捉値を更新する。無関係な state の変更では list を訪れず、行の表示だけに関係する state 変更では key の再比較を省く。配列全置換は O(n) の key 検査を行う。重複 key や prepare の失敗が state / DOM の commit 前に確定する。

生成・破棄・再挿入では detached frame のハンドルを準備中の領域に隔離し、成功後だけ現在の frame 集合に入れる。遅延取得後と commit 前には元の event element が同じ owner の下にあることを確認する。同じ key であっても削除した古い要素の event は、新しい要素へ配送しない。

検証結果:

| 検証 | 結果 |
|---|---|
| MoonBit | 36 / 36、警告なし型検査・format 検査 |
| Node | 197 / 197。制御構文の追加テスト 9 件を含む |
| 従来アプリ E2E | 67 / 67 |
| 従来 widget E2E | 24 / 24、widget Node 28 / 28 |
| 制御構文 E2E | 4 / 4。key と DOM 同一性、入れ子、fallback の失敗、import barrier 中の差し替え、2 ShadowRoot の状態・dispose を確認 |
| veri 0.2.1 | 有限モデル 31 ケース、11 broken variants。regions/strict の完全到達集合 40 状態で安全性を確認 |
| 生成サイズ | 既存 counter / composition / schema Form の JavaScript が基準の全ファイルと hash まで一致。raw / gzip とも増分 0 bytes |
| SSR のみ | 制御構文を使っても browser JS / snapshot / resume marker なし。event 専用初期化も評価しない |
| 行 factory | 1 行と 4,096 行で同じ生成コードを使う |

[サイズの記録](../results/control-flow/size.json) の新規 fixture は Controls と Nested の全 JS chunk の合計。初期転送ではなく、全機能を含むサンプルの出力量である。Qwik / Preact との新たな速度比較は実施しておらず、既存の heavy-render 測定結果は更新していない。

vlmkit 0.24.0 の integrity / copy / scroll / handlers / interactions は全て pass、suspect は 0。interactions の warn 3 件は、初期状態で Show / Restore / Show rows を押しても変化しないというもの。Hide / Empty 後の再表示・復元は E2E で別に検証している。1280 / 375 px の初期・並べ替え・空配列 + 非表示 + catch の 6 画像を確認した。初期は 10 / 20、並べ替え後は index 0 に 20、index 1 に 10、空の状態では Empty と公開用エラー文字列が表示される。横溢れ、重なり、消えた操作ボタンはなかった。[gate と画像](../results/control-flow/quality/summary.json)。

`just control-check` と `just control-quality` で再実行できる。control-check は通常 CI にも追加した。

現在の制約は [制御構文の契約](../../docs/control-flow.md) 冒頭を参照。ErrorBoundary は同期描画だけを扱い、Suspense は拒否する。制御 component 内の独立 client owner / schema Form / RenderFragment、一部 native control、literal union の網羅性、resource、構造化配列 delta は今後の対象。Region の静的費用はまだ unknown で、DOM 数も null とし、明示 budget は通さない。従来の固定 template のコスト上限は継続する。有限モデルは行の寿命の限られた状態遷移の検査であり、compiler や DOM 操作全体の証明ではない。
