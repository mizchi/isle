# Custom Element / Shadow DOM widget の評価

2026-11-04。iframe 版の埋め込みを、`<isle-widget>` と native Shadow DOM に変更した。provider は Cloudflare Workers / Static Assets のまま。公開・stateless の64項目と検証付き Form を使用する。

## 変更

- 最初の HTML に固定サイズの Custom Element と module script を置く。未定義のタグには寸法属性による UA のサイズ予約がないため、同期 CSS も必須とした。
- descriptor にコンパイル済み HTML、inert snapshot、CSS、mount ESM の URL、manifest から計画した依存 closure を出力する。コードは並列で modulepreload し、state は操作まで復元しない。
- loader / runtime の root を Document または ShadowRoot とし、同名の scope を持つ複数 widget を独立させた。CodeRef / snapshot / handler ABI は維持する。
- mount の actionBaseURL により action と Form validation を同じ provider へ送り、credentials は omit にする。
- Worker の CORS は明示設定のみ。既定値は同一 origin 限定。公開例は '*'、限定配信には exact origin list を使える。null / 不正 origin、cross-origin の Cookie / Authorization を拒否する。入力型・policy・effects は従来の server 処理を通す。
- 取り外した要素を世代で無効化し、fetch / observer / listener / FormSession を閉じる。同期的な移動では state を維持する。

Shadow DOM は JS のセキュリティ境界ではなく、provider の JS は publisher の権限で動く。公開 stateless host のままで、認証や DB 永続化を実装したとは扱わない。

## TDD と回帰

Custom Element の埋め込み契約と CORS preflight / RPC のテストを先に失敗させてから実装した。Shadow DOM の E2E では、エラー一覧の fragment link が入力へフォーカスできないケースを実際に失敗させ、対象 control を直接 focus する修正で成功させた。Form の成功イベントも composed にして親から受け取れる。

`just ci` が成功。MoonBit 27 tests、Node 133 tests、型検査、有限モデル27ケースと10故障版、既存 E2E 55件、既存 Form の16 gate を維持した。追加 API の ShadowRoot / credentials の型契約も検査した。widget 専用 unit は10件。

`just widget-check` の Wrangler dry-run と、実際の workerd で次の11件が成功した。

1. PC で定義 ESM、descriptor、その他の code を個別に遅延させ、全段階と操作後の予約領域を比較。
2. モバイルで同じ検証。両方で第三者 Cookie 制限を有効にし、RPC の Origin が publisher で Cookie がないことを確認。
3. 二つの ShadowRoot で state、label / field、team filter、publisher CSS の影響を確認。
4. Enter による submit、reset、エラー一覧からの focus。
5. JS 無効時の固定領域と native link、provider ページの SSR。
6. descriptor が503のときの予約領域と accessible error。
7. viewport 外では descriptor を取得せず、近づいたら一度だけ取得。
8. 未完了の mount 中に削除し、再接続しても古い処理が復活しない。
9. 同期 DOM 移動で state と listener を保持し、重複取得しない。
10. descriptor が別 provider の module URL を返しても import しない。
11. 配信 ESM / descriptor の CORS、server 契約の非公開、preflight、policy の403と validation の422。

## CLS と部分 resume

| 親の幅 | 定義前 | descriptor 後・code 後・RPC / Form 操作後 | CLS | iframe |
|---|---|---|---:|---:|
| 1280px | 640×640px | 640×640px | 0 | 0 |
| 375px | 343×640px | 343×640px | 0 | 0 |

後続要素の document 座標も同一だった。snapshot の parse は操作前0件、操作後も `project` / `task-00` の2 scope に限られる。Shadow DOM の内部も同じ document の LayoutShift 観測対象となる。通常入力の直後の変化は CLS の recent-input 条件で除外する。表は本 fixture の結果であり、任意の親ページ全体や将来の動的内容の CLS を保証しない。

[PC 計測](../results/widget-elements/layout-1280.json)、[モバイル計測](../results/widget-elements/layout-375.json)、初期表示と保存後の画像を保存した。

## 公開 Workers での確認

https://isle-widget.mizchi.workers.dev/ を更新し、同じ11件の E2E を公開 HTTPS 配信に対して実行した。全件成功した。PC / モバイルの予約寸法は上表と同じで、読み込みから操作後まで後続要素の座標は不変、CLS は0、iframe は0個だった。

[配備バージョン](../results/widget-elements/deployment.json)、[公開 PC 計測](../results/widget-elements/remote/layout-1280.json)、[公開モバイル計測](../results/widget-elements/remote/layout-375.json)を保存した。`just widget-check-remote https://isle-widget.mizchi.workers.dev/` で再実行できる。

定義 JS は3003B / gzip 1292B、descriptor は141320B / gzip 8897B。[ビルド計測](../results/widget-elements/build.json)は gzip level 6。これらは起動後の app / runtime / handler chunk のサイズを含まない。Worker の server bundle は23.28 KiB / gzip 5.86 KiBで、nodejs_compat なしの dry-run と実配備が成功した。

## 表示検査

vlmkit 0.24.0 の integrity / copy / scroll / handlers / interactions / breakpoints sweep / responsive を publisher と provider に実行した。14 gate の verdict は全て pass、suspect は0。provider の interactions には、現値によって出力が変わらない reset / save を含む warning が8件ある。警告を抑制せず、変更済み値でのキーボード操作と RPC を E2E で検査した。

publisher の自動 scanner が Shadow DOM の全内容を網羅するとは扱わず、内部の挙動は E2E、共通 markup は provider ページでも検査する。[gate 集計](../results/widget-elements/quality/summary.json)、[PC](../results/widget-elements/quality/initial-1280.png)、[モバイル](../results/widget-elements/quality/initial-375.png)を目視確認した。見出し・filter・form は固定領域内に配置され、後続の親本文は領域外に保たれる。

[API と利用手順](../../docs/worker-widget.md)を参照。iframe 版の過去データは変更せず、今回の結果は `evals/results/widget-elements/` に分けて保存する。
