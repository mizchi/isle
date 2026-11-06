# unmount の解放責任のモデルと実装

2026-11-05。[契約](../../docs/resource-disposal.md)、[時相モデル](../../models/resource_disposal/model.mbt)、[所有・破棄カーネル](../../runtime/resource-owner.mjs)。

取得済み値の解放、進行中の取得への abort、破棄後の遅い成功、破棄済み／旧 owner への公開禁止を別の遷移で表した。値の確定回数の Once と、解放責任の Owned は別の型の性質とする。

- Strict の2 resources・owner 2世代の到達集合1,452状態を完全探索した。
- release が高々1回、取得前・生存中の早すぎる解放がないこと、正しい owner にしか公開しないこと、abort 要求が高々1回であることを検査した。
- 解放開始・destructor 完了の弱公平性を明示し、完了を Released / ReleaseFailed に分けた。失敗する destructor でも物理解放が必ず成功する、という主張には反例が出る。
- 9故障版の反例を、現在の MoonBit verifier から直接取得した。各反例の外部 schedule を Promise と task の barrier で実装へ再生し、修正版で安全性を確認した。[再生結果](../results/resource-disposal/replay.json)。公開と release の開始は実装が自動で行い、テスト側は呼び出さない。
- reentrant dispose、子孫の先行無効化、子から親・登録の逆順の解放開始、遅い取得、async / throwing cleanup、親からの drain、mount AbortSignal を実装テストにした。
- `just check check-types test verify eval` が通過。MoonBit 51 tests、Node 216 tests。report v2 全体は86ケース、応答性16ケース、期待する33反例を含み、全て再生できた。
- 既存 counter / composition / schema Form を production build し、基準の JS と hash まで一致した。raw / gzip とも増分0 bytes。[サイズ記録](../results/resource-disposal/size.json)。新カーネルは未参照の通常 graph へ含めていない。

Red では未実装の API / モデルに対して受入テストが失敗することを確認した。Green で破棄カーネルと正常・故障モデルを実装し、Refactoring で子 owner が初期化中に閉じられる場合も親の drain に残し、処理完了後は親の保持集合から外すようにした。

実装とモデルの全トレースの refinement 証明ではなく、反例由来の外部 schedule に対する回帰検査である。任意 JavaScript の alias、部分的な取得に失敗した adapter、物理的な close の成否、独立でないリソースの非同期 cleanup 完了順、外部 RPC の exactly-once は追加の契約が必要。後続の [自動接続](resource-bindings.md)で既存 component / widget の寿命へ接続した。resource DSL と temporal codegen は未実装。

再検証: `just resource-disposal-check`、`just verify`。
