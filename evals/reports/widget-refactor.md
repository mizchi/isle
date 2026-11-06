# Widget 共通化の評価

2026-11-04。64項目 dashboard の Web Component を、アプリ、配信先、Custom Element に依存しない境界へ整理した。[設計と API](../../docs/widget-architecture.md)を参照。

## 分離した契約

1. **WidgetDescriptor**。DOM なしで検査できる wire 契約。code / preload / actions を descriptor 自身の URL で解決する。静的出力は module:null / preload:[] とし、型でもこの組み合わせを表す。
2. **mountWidget(ShadowRoot, descriptorURL)**。fetch、SSR 配置、preload、module.mount、controller とキャンセルを担当する。Custom Element を使わず呼べる。同じ root の同時所有者は一つ。
3. **Custom Element adapter**。サイズ、viewport、接続・切断、通知に限定する。実際の切断は AbortSignal で共通 mount を閉じ、同期移動は維持する。
4. **Vite の widget 出力**。同じ IR / SSR renderer から descriptor / generated mount / SDK を出力する。生成済み HTML の正規表現による切り出し、script の除去、CSS の selector 書き換えを廃止した。
5. **共通 action HTTP / host adapter**。routing と CORS を Workers から移動し、createActionHandler が持つ。Workers は ASSETS との分岐だけ。Node の例も同じ handler を利用する。

既存の src 短縮形と動的 v1 descriptor は維持する。MoonBit frontend、ProgramIR、snapshot v2、CodeRef、handler ABI、ServerHost の認可・再検査の意味は変えていない。共通 lib/ / runtime/ に dashboard の import はない。

## TDD

任意の descriptor / SDK / action パス、別タグ、静的出力、portable action handler のテストを先に失敗させた。widget output が存在しない、専用 options が拒否される、共通 handler の preflight が405になる状態から実装して通した。

命令的 mount についても、二重 mount が受け入れられる失敗を記録し、root の所有権を追加して拒否・close 後の再利用を検査した。abort 後も未完了処理が root を占有する失敗を再現し、所有権の即時解放と await 後の signal 検査で修正した。失敗した mount も root を解放する。

label の HTML escape と、label 中の $& を replacement として解釈しないことも実ビルドで確認する。出力パスの traversal、曖昧な template、静的 descriptor の preload も拒否する。

## 別アプリ・別ホストでの実証

Node の /portable/ 以下で Counter / Editor を配信する。descriptor は components/counter.json、SDK は sdk/counter.js、タグは demo-counter、RPC は /portable/api/actions/。dashboard の module や Workers binding を利用しない。

- Custom Element から Counter を更新し、Editor が publisher Origin / cookie なしの RPC で更新される。
- 同じ descriptor を imperative mount し、二重 mount を拒否、close 後は inert な SSR DOM を保持、再 mount で初期値から再開する。
- 別ビルドの static Notice は Custom Element transport のみを取得し、UI runtime / handler / snapshot / modulepreload を取得しない。

## 検証結果

`just ci` 成功。MoonBit 27 tests、Node 142 tests、型検査、有限モデル27ケースと10故障版、既存 E2E 55件、既存 Form の16 gate が成功した。形式モデルの検証範囲を新しい DOM / HTTP 実装全体へ拡張したとは扱わない。

`just widget-check` の専用 unit 19件、Workers dry-run、Workers + Node の E2E 14件も成功した。型契約で source の二重指定、explicit descriptor の loader 省略、不正な静的 preload を拒否する。

既存の PC / モバイル fixture は640×640px / 343×640pxを保持し、定義・descriptor・code の遅延、RPC、Form 操作後も後続要素の位置は同じ、計測 CLS は0、iframe は0個だった。[PC](../results/widget-refactor/layout-1280.json)、[モバイル](../results/widget-refactor/layout-375.json)を保存した。任意の親ページや将来の動的内容の CLS を保証するものではない。

vlmkit 0.24.0 で既存 publisher / dashboard の14 gate と、新しい portable app の7 gate を実行した。全21 gate の verdict は pass、suspect は0。dashboard の interactions の8 warning は、現値や probe の順序で見た目が変わらない reset / save 等。portable 側には数字の button text の変化が ARIA / layout の変化として観測されない warning が1件ある。変更した状態からのキーボード・RPC と、Counter の Enter による加算を E2E で検査する。警告は抑制しない。

[既存 UI gate](../results/widget-refactor/quality/summary.json)、[portable app gate](../results/widget-refactor/portable-quality/summary.json)を保存し、両アプリの PC / モバイル画像を確認した。dashboard の固定 scroll 領域と親本文を維持し、Counter / Editor は見出しと二つの button を狭い幅でも表示する。

## 公開配信

既存の isle-widget を共通化した出力で更新し、公開 HTTPS URL に対して互換性 E2E 11件が成功した。PC / モバイルの予約領域と後続要素の位置を維持し、計測 CLS は0だった。SDK / descriptor の短縮 URL は既存の埋め込みタグから利用できる。

[配備バージョン](../results/widget-refactor/deployment.json)、[公開 PC 計測](../results/widget-refactor/remote/layout-1280.json)、[公開モバイル計測](../results/widget-refactor/remote/layout-375.json)、[check 集計](../results/widget-refactor/checks.json)を保存した。Node の別アプリはローカル HTTP で検証しており、Cloudflare に追加配備したものではない。

## サイズ

gzip level 6 の[ビルド計測](../results/widget-refactor/build.json)。定義 SDK は3003B / gzip1292Bから4839B / gzip2042Bへ増えた。追加した共通 wire 検査、imperative API、static variant、root の所有権管理を含むためであり、小型化したとは扱わない。descriptor は141320B / gzip8897Bから141345B / gzip8922B。いずれも app / runtime / handler chunk は別配信。

static Notice の descriptor は684B / gzip460B、SDK は4842B / gzip2048B。静的出力でも Custom Element と取得・配置の transport は必要であり、JS 全体が0になるという意味ではない。

## 残る制約

template / CSS / compiler output は trusted とする。Shadow DOM を origin / JS のセキュリティ境界にしない。公開例は stateless で、実認証や DB transaction は ServerHost adapter の責務のまま。CSS の nonce 伝播、外部 stylesheet 生成、Declarative Shadow DOM の出力は追加していない。
