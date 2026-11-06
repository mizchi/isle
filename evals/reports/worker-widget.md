# Workers と固定サイズ widget の評価

これは iframe 版の過去の評価です。現在の埋め込みは [Web Components 版](widget-elements.md)に変更しています。

2026-11-04。64項目の dashboard / ProjectForm を Workers Static Assets と Worker RPC に接続した。公開・stateless のデモで、保存結果は画面へ反映するが DB には永続化しない。再読み込みで初期化されることを widget 内にも表示する。

## 構成とテスト

第三者の親ページに、`width` / `height` 属性と同期適用される寸法 CSS を含む iframe を置く。親には JS を置かず、iframe 内だけで Isle を再開する。幅は `max-width:100%`、高さは固定、内容は内部でスクロールする。

最初に未実装の helper / adapter に対して6件の unit を失敗させ、HTML の予約寸法・引数検査、ASSETS / RPC の分岐、Origin / policy / validation を実装して通した。codegen から境界 record の検査と HTML encoder を分離し、Node 依存のない server 経路にした。型契約でも寸法省略と百分率の指定を拒否する。

`just widget-check` はビルド、Wrangler dry-run、unit、実際の workerd を使う E2E を実行する。現在の E2E は次を確認する7件。

1. 幅1280pxの親で、iframe HTML / JS を別々に遅延させても640×640pxを予約し、読み込み・操作後も後続要素が動かない。
2. 幅375pxの親でも343×640pxを維持する。両条件で第三者 Cookie 制限を有効にし、cookie なしの RPC / async validation / Form 保存が成功する。
3. 二つの iframe の state が独立し、親の button CSS が子へ漏れない。
4. Enter による加算・draft reset・RPC 保存、変更済み Form の reset が動く。
5. JS 無効でも SSR の64項目を表示し、予約領域を維持する。
6. widget が503でも領域を縮めず、後続要素を動かさない。
7. HTML の埋め込み用 CSP、公開領域からの server 契約の分離、親 origin の POST の403、不正な対象の403、入力制約違反の422を確認する。

iframe のコードを eager に準備しても snapshot は操作まで parse されず、操作後の復元は `project` と `task-00` に限られた。親での復元や JS の読み込みはなかった。

## ローカル実測

`localhost` の親に `127.0.0.1` の workerd を埋め込む。単なる別 port ではなく別 site とし、Chromium の第三者 Cookie 制限も有効にした。

| 親の幅 | HTML 応答前の slot | 操作後の slot | 親の CLS | 子の初期 CLS |
|---|---|---|---:|---:|
| 1280px | 640×640px | 640×640px | 0 | 0 |
| 375px | 343×640px | 343×640px | 0 | 0 |

後続要素の document 内の位置も全段階で同一だった。[PC の生データ](../results/widget/layout-1280.json)、[モバイルの生データ](../results/widget/layout-375.json)を保存した。

別 origin の子内の shift は親の PerformanceObserver では取得できないため、テストでは両方に observer を入れた。通常入力の直後に起きた子の変更は初期 CLS と分ける。表は本 fixture の結果であり、任意の親サイト全体や将来の動的コンテンツの CLS を保証しない。

## 公開 Workers での確認

新規 Worker `isle-widget` を https://isle-widget.mizchi.workers.dev/ に配備し、同じ7件の E2E を公開 HTTPS URL に対して実行した。全件成功し、親 `localhost` からの埋め込み・Cookie 制限下の操作・RPC・keyboard・SSR を確認した。公開配信でも上表と同じ寸法を維持し、親 CLS / 子の初期 CLS はどちらの幅でも0だった。

[配備情報](../results/widget/deployment.json)、[公開 URL の PC 計測](../results/widget/remote/layout-1280.json)、[モバイル計測](../results/widget/remote/layout-375.json)を保存した。`just widget-check-remote https://isle-widget.mizchi.workers.dev/` で再実行できる。

## 表示検査

vlmkit 0.24.0 の integrity / copy / scroll / handlers / interactions を親・widget にそれぞれ実行した。10 gate の verdict は全て pass、suspect は0。interactions の widget 側には `inert-control` warning が8件ある。reset / save のように現在値によって見た目が変わらない操作、非同期応答、検査の操作順序を含むため、値を変更した状態からのキーボード操作を上記 E2E で別途検証した。警告は削除・抑制していない。自動 gate の対象数には上限があり、全64項目の全操作を網羅したとは扱わない。

[gate 集計](../results/widget/quality/summary.json)、[PC 初期表示](../results/widget/quality/initial-1280.png)、[モバイル初期表示](../results/widget/quality/initial-375.png)を保存し、初期表示と保存後の画像を目視確認した。

## 共通部分への回帰確認

`just ci` が成功した。MoonBit 27 tests、Node 129 tests、型検査、有限モデル27ケースと10故障版、既存 E2E 55件、既存 Form の16 gate を維持した。widget 専用では unit 6件と workerd E2E 7件が成功した。

Wrangler dry-run は `nodejs_compat` なしで成功し、Worker bundle は21.18 KiB / gzip 5.40 KiB。これは server 側の bundle サイズで、別配信の client assets を含まない。

[使用方法と配備手順](../../docs/worker-widget.md)、[iframe API 契約](../../lib/widget.d.mts)、[Worker API 契約](../../lib/worker.d.mts)を参照。
