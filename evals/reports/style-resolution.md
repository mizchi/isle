# CSS の準備と CodeRef の解決

2026-11-06。非同期 chunk の CSS を Vite の最終出力から取得計画へ統合し、stylesheet の準備と owner の確認後にだけ CSS 適用・module 評価・setup・更新へ進む経路を実装した。[利用方法と契約](../../docs/style-resolution.md)、[取得計画の設計](../../docs/resolution-optimizer.md)を参照。

auto / preload は JS と CSS を先読みしても適用・評価しない。操作時の CSS 応答を待ち、有効な owner から適用する。eager は明示的な起動時評価を許可し、Document と ShadowRoot のそれぞれで CSS の準備を先行させる。CSS のサイズは auto の追加 gzip 予算と cold code budget に含め、サイズ不明を0として扱わない。

- **Red**: CSS 依存閉包・予算・markup・portable adapter と production build に対して未実装の契約を検査した。browser では CSS 応答を止め、早すぎる評価・適用、失敗後の再試行、破棄後の反映を観測した。
- **Green**: manifest に任意の styles 表を追加し、root ごとの CSS ゲートと CodeRef / resource 解決を接続した。widget descriptor の相対 URL と preloadStyles を検証し、共有 engine を使っても stylesheet は各 ShadowRoot へ配置する。
- **Refactoring**: CSS capability を module graph の確定後に選び、AST define と minify によって未使用経路を除去した。root 内のゲートを SDK / engine 間で共有し、compiler が決める挿入順を応答順・操作順から独立させた。

browser の追加検査で、mount module の import 中に abort すると古い CSS ゲートが残り、同じ root に別 provider を mount できなくなる不具合を検出した。abort listener を import 完了まで保持し、旧ゲートの遅い close が新ゲートを削除しないよう所有を確認した。別 origin の SDK と engine が共存する場合も検査した。

既存 widget の barrier テストは、SDK の定義に必要な依存をファイル名で列挙していた。共通 CSS helper の chunk 抽出によってその前提が崩れたため、生成 manifest から SDK 定義の静的依存閉包を求めるよう変更した。engine / handler を止めた状態での領域予約・CLS の検査は保持している。

## 検証

`just ci` は MoonBit 53、Node 248、browser 113を通過した。browser の内訳は既存67、制御構文4、resource15、自動取得計画3、CSS24。CSS の対象検査は共有 engine 15、通常 runtime 9であり、通常 runtime では widget / eager 用の6ケースを実行対象から外す。CSS の Node 対象9ケースと MoonBit 対象2ケースも通過した。Form a11y は2 suite それぞれ8 gate を通過した。

`just widget-check` は Node 29、browser 24、Workers dry run を通過した。最後に追加した CSS の型契約 fixture は `pnpm exec tsc -p tsconfig.contracts.json` で確認した。[検証記録と source hash](../results/style-resolution/validation.json)。

CSS の browser 検査では module top-level の probe、computed style、setup、state / DOM 更新を観測する。CSS 待機中の dispose・DOM 削除・別 root への移動・close、手動 resource access、エラー後の再試行、逆順の操作、同一 root の共有、複数 ShadowRoot、eager、別 origin、abort 後の root 再利用を含む。

MoonBit / veri 0.2.1 の CSS モデルは1 owner の cold 解決を30状態で完全探索する。安全性、setup・commit・cancelled への到達性、および CSS-ready / owner guard を外した2故障版の再生可能な反例を検査する。既存分を含む形式検査は92ケース・35反例で通過した。[形式検査の全記録](../results/formal.json)。

## サイズと生成計画

`just style-size` は ES2023 production、debug / profile 無効、ファイルごとの gzip 合計で比較する。CSS を使わない counter / composition / schema-form は直前の自動取得計画版と生成 JavaScript が hash まで同一で、raw / gzip とも増分0 Bだった。CSS あり・なしの最小 resource 構成の差は JS raw +2,059 B、gzip +762 B。CSS asset 自体は別に記録する。SSR-only 構成は CodeRef の JS / CSS とも0 Bだった。[サイズ記録](../results/style-resolution/size.json)。

共有 widget の SDK / engine は後続 widget のため CSS capability を常に持つため、未使用時の0 Bという結果は通常アプリについての結果である。transport を `isle/widget/3`、共有 engine を `isle/client/6` に更新し、旧 capability の engine と混在しないようにした。descriptor / snapshot の wire version は2のままとする。

[生成計画の標本](../results/style-resolution/plans.json)には通常 auto と明示 eager の manifest の判断、CSS 依存、widget の preloadStyles を保存した。fixture は debug / profile 有効の検査用構成であり、この標本のサイズを上記 production の比較へ流用しない。

```sh
just style-check
just style-size
just verify
just widget-check
```

速度・INP の再測定や CSSOM 全体の証明ではない。初期 SSR に必要な CSS は通常の entry import などで配布する。専用 CSS DSL、class token の必要性解析、未使用 selector の除去、profile に基づく取得計画、source IR と有限モデルの refinement 証明は後続である。native fetch / import 自体の中止や font / image の完了は保証しない。[読解・記述課題](../scenarios/style-resolution/brief.md)は用意したが、参加者評価と読解 grader は未実施。
