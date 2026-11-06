# コンパイラによる自動取得計画

2026-11-05。QRL 相当の参照を使うアプリで、取得時期を境界ごとに手書きせず compiler / build pass が計画する初段を実装した。意味と後続の制約グラフは [設計](../../docs/resolution-optimizer.md)へまとめた。

既定の loading は auto。input/change、次いで submit/invalid の JS 依存閉包から、追加 gzip 予算内の候補を選ぶ。物理 chunk を基準に共有依存を一度だけ数え、候補を追加するたびに限界費用を再計算する。click sibling と入力用 handler は packing を分ける。サイズ不明・外部 import は保守的に残し、明示 lazy/preload/eager は保持する。

- **Red**: 未実装の planner、auto build、無効 budget、外部 import の費用、依存が初期取得される理由に対してテストを失敗させた。
- **Green**: build-only planner を実装し、Vite の最終 chunk から manifest / HTML / widget descriptor へ反映した。browser registry と loader の ABI は変えていない。
- **Refactoring**: 非連続の click sibling を共有しつつ入力用 chunk から隔離した。診断に手動指定と既定値を区別する理由、追加費用、初期取得元 `initialBy` を残した。

Node 10ケースは共有閉包、gzip 予算、手動指定、決定性、未知費用、dynamic descendant の除外、SSR と packing を検査する。Chromium 3ケースは予算8192 / 0について実際の request、module top-level の評価、snapshot decode、setup、close / DOM 削除後の破棄を観測する。取得済みでも操作前に評価・復元・setup は起きず、予算だけを変えても同じ操作結果になる。

既存 Form の初期表示テストも、「runtime の要求が一切ない」という条件から、auto による要求はあるが評価・復元はないという条件へ更新した。module 本体の probe と controller の restores を両方確認し、native label・description・制約の検査は保持した。

`just ci` は MoonBit 51、Node 237、既存 browser 67、制御構文4、resource15、自動計画3、形式検査86、評価 corpus と Form a11y 2 suite を通過した。`just widget-check` は Node 28、browser 24、Workers dry run を通過した。最後の planner の可読性リファクタ後に Node の対象10ケースを再実行した。[検証記録](../results/resolution-loading/validation.json)。

既存 counter / composition / schema-form の JavaScript は直前の resource-bindings 実装と hash まで同一で、raw / gzip とも増分0 B。[サイズ記録](../results/resolution-loading/size.json)。HTML の先読みタグと manifest の説明は変わる。browser で計画を探索する scheduler や profiler は追加していない。

[生成計画](../results/resolution-loading/plans.json)は予算8192と0の fixture から取得した。`just chunks dist/auto-loading/isle.manifest.json` で source、CodeRef、物理 chunk、判断理由を対応付けられる。

```sh
just loading-check
just resource-binding-size
```

速度・INP ベンチマークの再測定ではない。現在はイベントを手掛かりにした決定的な greedy 戦略であり、全体で最適な配置や時間上限を保証しない。CSS の必要性解析・CSS-ready との commit 統合、effect 推論、resource の実行開始時期、profile 入力、source IR からのモデル自動抽出は後続である。[記述・読解の追加課題](../scenarios/resolution-loading/brief.md)は用意したが、参加者評価と読解 grader は未実施。
