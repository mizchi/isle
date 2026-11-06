# 入れ子の component と Flow 風の props

2026-11-05。名前付き props とタグによる合成を基本にし、純粋な component の展開、独立した client の再開、children の投影を実装した。構文の参考は [Flow Component Syntax](https://flow.org/en/docs/react/component-syntax/)。Flow / React の実行系や型機能全体を取り込んだものではない。

## 実装した境界

```text
component Card(title: string, children: RenderFragment) {
  <section><h2>{title}</h2>{children}</section>
}
client component Counter(initial: number) {
  state count = initial;
  <button>on click increment { count += 1; }{count}</button>
}
server component Page(seed: number) {
  <Card title="Counters"><Counter initial={seed} /><Counter initial={seed + 10} /></Card>
}
```

component の引数は読み取り専用の名前付き props。属性の順序に依存せず、型・欠落・重複・余分な props を検査する。普通の関数としての呼び出しや、定義自体を component の中へ入れる構文は許可しない。従来の TS 分割代入は互換用に維持する。

MoonBit は参照先、型、実行側、children の一度だけの使用、合成グラフの循環を検査する。forward reference を認め、未使用の定義も検査する。universal は universal のみ、client は universal / client、server は全てを呼び出せる。

JS の合成層は universal / server の純粋な呼び出しを展開する。props と derive は式へ置換し、ローカル id と ARIA / label 参照を配置ごとに区別する。親の mutable な値を使う純粋な子の表示も、親の生成済み binding で更新する。

client の呼び出しは island として残す。親から渡せるのは不変の初期値で、reactive client props は `E_COMPONENT_CAPTURE` で拒否する。children は呼び出し元の描画を表示位置へ投影するだけで、DOM・renderer・RenderFragment を snapshot に送らない。client 境界の children に、親の mutable な式や親が所有する handler を置くことも拒否する。

## SSR、チャンク、所有権

`prepareProgram()` が定義のコピーを所有し、同じグラフで SSR と到達可能性を扱う。Vite は mounts から到達する client 定義だけをコード化し、読み込み方針を子へ伝える。純粋な呼び出しは owner / snapshot を増やさない。SSR 専用 mode は全ての子と children に伝わる。

同じ client 定義を複数置く場合は handler を共有し、scope と状態を分ける。親の text locator は子の marker を拾わない。最小化された親の DOM root が子を含まない場合も、明示した親 owner を使って dispose を伝える。未再開の子と import 待機中の子も停止し、兄弟の枝は維持する。

新しい入れ子の処理は `__ISLE_NESTED__` で制御する。通常の平坦な Counter 出力に親 owner の処理が含まれず、入れ子のデモには含まれることを[ビルド出力](../results/composition/builds.json)で確認した。異なるアプリの出力なので、サイズ差を速度改善や転送量の比較には使わない。

共有エンジンは全 capability を持ち、client ABI を3へ更新した。古い ABI のエンジンを共有して入れ子の更新先を誤認しないよう、初期化時に拒否する。widget transport / descriptor / snapshot の wire 形式は変更していない。

## TDD と回帰検査

構文・型・実行側・循環・展開・SSR のテストを先に失敗させてから実装した。ブラウザーでは、親の更新が子の marker を使ってしまう失敗と、親を dispose しても子が復元される失敗を再現し、所有権の検査と破棄の伝播を修正した。

`just ci` 成功。MoonBit 36件、Node 169件、型検査、既存の有限モデル27ケースと10故障版・permit proof、E2E 64件、Form の16 gate が通った。component の合成全体を形式モデルで証明したものではない。

入れ子の E2E 8件では次を確認した。

- 子の初回操作で親・兄弟の snapshot を parse せず、親の handler chunk も取得しない。
- 子を先に操作した後でも、親の更新は親の表示だけを変更する。
- 未再開の親の dispose が子へ伝わり、兄弟の枝を停止しない。
- 親の最小 DOM root の外にある子にも、論理的な所有関係で dispose が伝わる。
- 子の chunk import 待機中に親を破棄すると、遅れて状態を復元・commit しない。
- SSR 専用の子孫・children に実行用 JS・snapshot・marker が出ない。
- 入れ子の schema Form の id、検証、送信、reset が独立する。
- shared / standalone SDK の両方で、二つの ShadowRoot にある親子が独立して動く。

Workers / Node の既存 widget 検査も unit 28件・E2E 24件が成功した。

## デモと読解評価

`just dev-composition` で [デモ](../../examples/composition/app.isle)を起動できる。vlmkit 0.24.0 の integrity / copy / scroll / handlers / interactions / breakpoints sweep / responsive は7項目全て pass、suspect は0。初期値で戻すボタンを押す interactions の3 warning は残るが、変更後の各子の reset が親や兄弟を変更しないことを別途操作して確認した。[集計](../results/composition/quality/summary.json)を保存した。

初回の目視確認で、外側の mount wrapper と内部 Card の class が重なり、PC の本文が見出しとずれる問題を見つけた。class を分けて修正し、モバイルの見出しの折り返しも調整して、全 gate を再実行した。

最終の [PC 初期](../results/composition/quality/initial-1280.png)・[変更後](../results/composition/quality/changed-1280.png)、[モバイル初期](../results/composition/quality/initial-375.png)・[変更後](../results/composition/quality/changed-375.png)を確認した。PC は見出しと本文の開始位置が揃い、モバイルは縦に並ぶ。親と子 A の値だけが6へ変わり、子 B / C は15 / 25を維持する。

[読解・記述課題](../scenarios/composition-intent/brief.md)と `composition-intent` grader を追加した。fixture の snapshot と初期値を照合し、親の一括復元・children の直列化・reactive client props の誤読を拒否する。参加者評価は未実施である。

使い方と制限は[合成のガイド](../../docs/composition.md)を参照。

## 公開 Worker

既存の [isle-widget](https://isle-widget.mizchi.workers.dev/) を client ABI 3 の成果物へ更新した。配備 ID は `7747170d-4154-4b82-b520-4e9d3973e9be`。[配備情報](../results/composition/deployment.json)を保存した。

公開 HTTPS に対する既存 E2E 13件も成功し、shared / standalone の埋め込み、PC / モバイルの予約寸法と CLS 0、Form / RPC を維持した。Node の小さい Counter を先に読み込み、公開 Worker の Form がその full engine を再利用する E2E 1件も成功した。[複数 provider の結果](../results/composition/mixed-remote-runtime.json)、[公開 PC](../results/composition/remote/layout-1280.json)、[モバイル](../results/composition/remote/layout-375.json)を保存した。

全体の件数と制限は[検証集計](../results/composition/validation.json)に記録した。公開 Worker 自体は従来の dashboard デモであり、新しい入れ子デモはリポジトリ内の examples/composition で提供する。
