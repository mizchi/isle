# Runtime の版の固定と standalone 配布

2026-11-04。共有 SDK は同じ JavaScript realm 内で runtime の版を完全一致に固定する。版・ABI が違う SDK を拒否し、独立した runtime が必要な場合は明示的な standalone ビルドを使う。

## 配布契約

```ts
isle({ entry, mounts, widget: { runtime: 'shared' } });     // default
isle({ entry, mounts, widget: { runtime: 'standalone' } });
```

| 対象 | shared | standalone |
|---|---|---|
| runtime | ページ内で同じ版・ABI の実装を共有 | 配布物に含まれる専用の実装 |
| 異なる版の共有 SDK | 後から来た SDK の初期化を拒否 | 共有 pool に参加せず併用可能 |
| UI 機能 | 後続アプリに対応する全機能版 | アプリの capability で削減 |
| 既定のタグ名 | isle-widget | isle-widget-standalone |
| デモの配布先 | /widget.js、/widget.json | /standalone/widget.js、/standalone/widget.json |

版は package.json の `0.0.1` が既定値。`widget.runtimeVersion` で配布版を明示できる。semver の互換範囲は使わず、patch の違いも拒否する。同じ版の diagnostics / profile の異なる ABI variant も拒否する。

共有 SDK は vendor の取得・Custom Element 定義を始める前に版・ABI をまとめて確保する。不一致でも既存 widget は動作を続け、standalone への自動切り替えは行わない。vendor の取得が失敗した場合、同じ版の別 provider から再試行できるが、ページの版の固定は解除しない。古い registry protocol も同じ Symbol key で検知して拒否する。

descriptor は wire version 2 とし、`runtime: { version, mode }` を必須化した。SDK と一致しない場合は HTML の展開・preload・app module の import より前に拒否する。runtime 情報のない旧 v1 descriptor も拒否する。取得した app module の identity は `mount()` の前に検査する。native import の評価自体は検査より先に起きるため、任意の未信頼コードを隔離する仕組みではない。

standalone もコード分割・manifest による並列取得・HTTP API を維持する。単一 JS ファイル化やオフライン実行の指定ではない。複数の standalone 版を置く場合は異なるタグ名でビルドする。同名の Custom Element に版・配布モードの違いがあれば拒否する。root 上の所有権は共有版・standalone 間でも検査するため、同じ root へ二重 mount できない。

## TDD とブラウザー検証

独立した SDK copy のテストを先に失敗させ、版の照合と配布切り替えを実装した。専用 unit は28件、local E2E は24件成功。

- 異なる版を両方の読み込み順で拒否し、拒否した provider の vendor を取得しない。最初の widget の状態更新は続けられる。
- 初期化中の Promise も版を固定し、vendor が名乗る版の不一致・古い registry を拒否する。同じ版での再試行と ABI / 必須 export の検査を維持する。
- shared と別の版の standalone が同居し、状態・close・RPC を分離する。standalone 単独では global registry を作らない。
- descriptor の版・配布モード不一致は既存 DOM を書き換えない。app module の版不一致では handler を付けず、失敗後の root を再利用できる。
- shared / standalone と resume / SSR の4通りをビルドする。standalone の全 JS に共有 registry のコードが含まれない。SSR 出力は snapshot / handler / UI engine を展開しない。
- 同じ版の SDK を2 origin から競合させ、14 root の独立性と transport / engine 各1回の取得・評価を維持する。

版違いの fixture は同じ実装を `0.0.1-fixture` としてビルドしている。過去のリリース実装同士を実行したという意味ではない。版文字列は改変コードの hash ではなく、同じ配布版の実装・ABI を揃えることが前提。

[共有版と別版 standalone の実測](../results/runtime-distributions/runtime-distributions.json)、[14 root](../results/runtime-distributions/shared-runtime.json)、[異なるアプリの併用](../results/runtime-distributions/mixed-runtime.json)を保存した。

## 回帰検査と表示

`just ci` 成功。MoonBit 27件、Node 151件、型検査、veri 0.2.1 の有限モデル27ケースと10故障版、MoonBit の permit proof 1 goal、既存 E2E 55件、Form の16 gate が通った。今回の共有 registry 全体を形式モデルで証明したものではない。

共有版は定義・descriptor・code を個別に遅延させた。standalone も定義 JS を遅延させ、ready 後に状態更新・RPC・検証表示を行った。両方で1280pxの親では640×640px、375pxでは343×640pxを維持し、後続要素の位置は変わらず、計測 CLS は0だった。[共有版 PC](../results/runtime-distributions/layout-1280.json)・[モバイル](../results/runtime-distributions/layout-375.json)、[standalone PC](../results/runtime-distributions/standalone-layout-1280.json)・[モバイル](../results/runtime-distributions/standalone-layout-375.json)を保存した。

vlmkit 0.24.0 の integrity / copy / scroll / handlers / interactions / breakpoints sweep / responsive を、両配布モードの親・provider に実行した。計28 gate は全て pass、suspect は0。各 provider の interactions には既存の reset / save 等に8 warning があり、変更済み状態の keyboard / RPC は E2E で検査する。[shared 集計](../results/runtime-distributions/quality/summary.json)、[standalone 集計](../results/runtime-distributions/standalone/quality/summary.json)を保存した。

共有版の[PC](../results/runtime-distributions/quality/initial-1280.png)・[モバイル](../results/runtime-distributions/quality/initial-375.png)、standalone の[PC](../results/runtime-distributions/standalone/quality/initial-1280.png)・[モバイル](../results/runtime-distributions/standalone/quality/initial-375.png)を目視確認した。固定領域内のスクロール、親本文、狭い幅での折り返しを維持している。

## 出力サイズ

[ビルド計測](../results/runtime-distributions/build.json)。gzip level 6、単位は byte。ファイル単位のサイズであり、以下だけで全転送量を表すものではない。

| 対象 | raw | gzip |
|---|---:|---:|
| shared SDK bootstrap | 402 | 263 |
| shared registry + identity helper | 2416 | 999 |
| shared transport | 5254 | 2242 |
| shared UI engine | 17706 | 6808 |
| standalone SDK / transport | 5271 | 2240 |
| standalone identity helper | 656 | 369 |

standalone はこのほかにアプリ別 loader / resume / Form / handler 等を取得する。共有版もアプリ別 chunk・descriptor が別途必要。standalone は shared の全機能 engine を使わず、例えば static standalone は transport のみになる。版検査の追加分は共有 helper / transport の増加として現れており、今回を速度改善のベンチマークとしては扱わない。

## 公開 Worker

既存の [isle-widget](https://isle-widget.mizchi.workers.dev/) を更新し、[standalone 配布](https://isle-widget.mizchi.workers.dev/standalone/)も公開した。配備 ID は `6c92a267-44d4-4c92-ae8c-4800298d95e7`。

公開 HTTPS に対する E2E 13件が成功した。共有版・standalone とも PC / モバイルの予約寸法と計測 CLS 0 を維持した。[公開 shared PC](../results/runtime-distributions/remote/layout-1280.json)・[モバイル](../results/runtime-distributions/remote/layout-375.json)、[公開 standalone PC](../results/runtime-distributions/remote/standalone-layout-1280.json)・[モバイル](../results/runtime-distributions/remote/standalone-layout-375.json)を保存した。

さらに Node の Counter を先に読み込み、同じ版の公開 Worker の Form を後から mount する E2E 1件が成功した。Node 側の full engine で検証・保存が動き、transport / engine の取得・評価は各1回のままだった。[実測](../results/runtime-distributions/mixed-remote-runtime.json)、[配備情報と descriptor identity](../results/runtime-distributions/deployment.json)を保存した。

使い方は[共通設計](../../docs/widget-architecture.md)と[Workers の配布手順](../../docs/worker-widget.md)を参照。
