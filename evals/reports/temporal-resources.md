# Once の時相意味論と有限モデル検査

2026-11-05。[仕様](../../docs/temporal-resources.md)、[モデル](../../models/resource_once/model.mbt)、[検査結果 report v2](../results/formal.json)。

検査した契約は、一 resource identity ごとの開始と結果公開が高々1回であること、終端結果が安定すること、owner の破棄と generation の切り替えを越えて誤った結果を適用しないこと、将来読む値を捨てないこと。Pending からの応答性は、生存中の現在の処理に限定した producer / delivery の弱公平性を仮定する。

- Strict / Cold の到達集合126状態、Strict / SSR ready の到達集合22状態を完全探索した。
- 2個の独立 Once の4状態で、各値が once でも component は2 transaction 更新され得ることを反例で確認した。
- 応答性6ケースのうち3ケースは公平性の下で成立。仮定を外した2ケースと完了を失う故障版1ケースに lasso の反例がある。
- verifier 全体の60ケースは期待結果と一致。反例21件は全て step / holds に戻して再生した。18故障版、2仮定不足、1契約不足を category で区別した。
- `just check check-types test verify eval` が成功。MoonBit 46 tests、Node 197 tests。resource_once のテストは9件。

Red ではモデル API が未実装で受入テストが失敗することを確認した。Green では正常モデルの安全性と公平な応答性、故障版と仮定不足の反例、成功・失敗・破棄・次世代の成功の到達性を確認した。Refactoring で reporter に式、公平性、loop 開始点、反例の分類を追加し、CI から再検査できるようにした。

公平性は破棄済みリクエストの応答を要求しない。旧 request の成功が遅れて届く遷移は残し、現在の owner に所属する進行だけを fairness の対象とした。仮定を強くして不要な経路を除外しないための回帰テストも置いた。

resource DSL / browser runtime は未実装であり、モデルの反例を browser の resource 操作で再現していない。任意の TS 本体、外部 RPC の exactly-once、無制限の owner / resource 数、ネットワークの実際の応答性、生成 JS の refinement は未検証。参加者による記述・読解評価も今回実施していない。
