# 複数 widget の共有ランタイム

この記録は版の厳密な照合を入れる前の評価。現在は異なる版・ABI の併走を拒否し、独立配布には明示的な standalone を使う。[版の固定と standalone 配布](runtime-distributions.md)を参照。以下の ABI 名・サイズ・件数は当時の実測として保持する。

2026-11-04。同じページで複数の埋め込み SDK が読み込まれることを前提に、互換 ABI ごとに共通コードの初期化を一つにした。アプリ固有の state / registry / RPC transport は ShadowRoot ごとに維持する。

## 実装

`Symbol.for('isle.runtime.registry/1')` のページ内 registry に、初期化中から Promise を登録する。別 bundle の同時呼び出しも同じ entry を待つ。初期化に失敗した entry は破棄し、別 provider の次の試行を妨げない。返された module の ABI と必須 export を検査する。これは同じ JavaScript realm 内の仕組みで、別 Window / 非対応の古い SDK のコードを強制的に統合するものではない。

SDK の static import で各 provider の vendor を先に実行する構成をやめ、共有 factory が選ばれたときだけ vendor を dynamic import する。

| 共有単位 | ABI | 内容 |
|---|---|---|
| transport | isle/widget/1 | Custom Element、descriptor の展開、imperative mount、root の所有権 |
| UI エンジン | isle/client/1:debug=0:profile=0 | loader / resume / Form。widget 用は全 capability を含む |

diagnostics / profile の variant や非互換 ABI は別 entry とする。widget 用を全機能版に揃えることで、先に読み込まれた Counter の機能削減が後続の Form に影響しない。通常の widget 無効のページは従来の capability 別削減を維持する。静的 widget は transport のみで、UI エンジンを取得しない。

`sharedRuntimeInfo()` は ABI / loading・ready の snapshot を返す。root、state、認証情報や mutable な内部 cache は返さない。SDK の bootstrap やアプリ固有の code / descriptor の取得まで全て一つになるという主張ではない。

## TDD と検証

Node では独立した module copy を読み込み、同じ realm の初期化が競合しても factory が一度だけ呼ばれることを検証した。初期化失敗の共有と次の試行、ABI 不一致、必須 export の欠落、非互換 ABI の分離も検査する。最初に未実装のテストを失敗させてから実装した。

ブラウザーでは次の二つを追加した。

1. 同じ SDK を異なる origin から同時に import する。mountWidget の実体が同一であり、別 SDK から同じ root を mount しても拒否されることを確認する。二つの root に加え12 root を同時に mount し、state を独立に更新する。一つの close / 再 mount や batch の close が他を停止しない。
2. 小さい Counter を先に mount し、別ビルドの64項目 dashboard / ProjectForm を後から mount する。最初の Counter から選択された UI エンジンで、Form の検証・保存とそれぞれの origin への RPC が動く。一方を close しても他方は動作する。

vendor の応答に評価回数の mark を足した観測用 E2E で、transport / UI エンジンの URL が一つずつ、module 評価が一回ずつであることを確認した。これは速度ベンチマークではなく、観測用の追記を production asset に保存してはいない。その他の互換性 E2E は未加工の出力を使う。

[14 root の実測](../results/shared-runtime/shared-runtime.json)、[異なるビルドの実測](../results/shared-runtime/mixed-runtime.json)を保存した。

## 回帰検査

`just ci` 成功。MoonBit 27 tests、Node 145 tests、型検査、有限モデル27ケースと10故障版、既存 E2E 55件、既存 Form の16 gate を維持した。widget 専用 unit と共有 runtime の unit は計22件、Workers / 複数 origin の Node SDK を含む E2E は16件が成功した。形式モデルの検証範囲をブラウザーの共有 registry 全体へ拡張したとは扱わない。

PC / モバイルで定義・descriptor・code を遅延させても予約領域は640×640px / 343×640pxを維持し、後続要素の位置は変わらず、計測 CLS は0だった。[PC](../results/shared-runtime/layout-1280.json)、[モバイル](../results/shared-runtime/layout-375.json)を保存した。任意の親ページ全体や将来の動的内容の CLS を保証するものではない。

vlmkit 0.24.0 の14 gate は全て pass、suspect は0。interactions の8 warning は既存の reset / save 等で、変更済み状態からの keyboard / RPC は E2E で検査する。[集計](../results/shared-runtime/quality/summary.json)を保存した。

[通常の PC](../results/shared-runtime/quality/initial-1280.png)・[モバイル](../results/shared-runtime/quality/initial-375.png)と、[複数 widget の PC](../results/shared-runtime/shared-widgets-1280.png)・[モバイル](../results/shared-runtime/shared-widgets-375.png)を目視確認した。複数 widget の画像は batch を追加する前の二つを示し、一方の Editor だけが Draft! へ更新されている。親本文と固定領域を保ち、両方で control が読める。

最初の quality 実行では、長時間起動したローカル workerd が存在する新 asset を404にする不整合を検出した。サーバーを再起動し、失敗 gate、次に全 gate を実行して成功を確認した。これを黙って成功として扱ってはいない。

## 読み込みとサイズの考え方

一つの runtime に任意の widget を参加させるため、埋め込み用 UI エンジンは全機能版になり、最初の小さな widget の初期コード量は増える。複数 widget で共通コードを重ねて取得・評価しないことを優先した変更であり、単一 widget の初回読み込みが高速化したとは主張しない。snapshot は引き続き操作まで parse しない。

静的 widget は SDK bootstrap と共有 transport のみ。通常の widget 無効ページにはこの全機能版を適用しない。SDK 単体のサイズだけで全転送量を表さず、bootstrap / 共通 helper / transport / UI engine / app chunk を区別して計測する。

gzip level 6 の[ビルド計測](../results/shared-runtime/build.json)は次のとおり。app 固有の chunk / descriptor は別途必要。

| 対象 | raw | gzip |
|---|---:|---:|
| widget.js bootstrap | 283B | 204B |
| 共有 registry helper | 976B | 548B |
| 共通 transport | 4871B | 2061B |
| 共通 UI エンジン | 17683B | 6789B |

bootstrap / helper は配信 URL が違えばそれぞれ取得され得る。重い transport / UI エンジンは、複数 origin の試行でも一つずつしか取得・評価されなかった。

## 公開 Worker での確認

既存の isle-widget を更新し、公開 URL に対する互換性 E2E 11件が成功した。PC / モバイルの予約寸法と計測 CLS 0 を維持した。

さらに localhost の親から、Node の Counter と公開 HTTPS Worker の ProjectForm を順に mount した。Node 側のエンジンを使って公開 Form の検証・保存が動き、Node / Worker それぞれの RPC も成功した。transport / UI エンジンの取得 URL と評価回数はそれぞれ一つのままだった。

[公開 Worker と別 provider の実測](../results/shared-runtime/mixed-remote-runtime.json)、[配備バージョン](../results/shared-runtime/deployment.json)、[公開 PC 計測](../results/shared-runtime/remote/layout-1280.json)、[公開モバイル計測](../results/shared-runtime/remote/layout-375.json)を保存した。

[共通設計](../../docs/widget-architecture.md)、[共有契約](../../runtime/shared-runtime.d.mts)を参照。
