# resume を支える Web 標準と提案の調査

調査日: 2026-11-02。実装・ブラウザ実験・性能測定は行っていない。以下の「採用」はこのプロジェクトへの設計提案であり、API の標準化状態やブラウザ実装状態とは別である。特に Living Standard に掲載されていても主要エンジンすべてで使えるとは限らない。

## 1. runtime の JS を減らすため、どの標準を採用すべきか

### Takeaway

最も確実なのは、標準 HTML の操作・フォーム・CSS をそのまま出力し、そこに必要のない handler と snapshot を作らないこと。新しい DOM API は小さい capability adapter に閉じ、未実装の標準・提案を resume の必須条件にしない。

### Cited Findings

次表の対応状況は調査日時点の一次仕様と Web Platform DX の互換性データによる。右列の採否と fallback は本設計への提案。

|機能群|確認できた状態・機能|本設計への提案|
|---|---|---|
|標準 HTML の dialog／popover／Invoker Commands／forms|`commandfor` と `command` が button の標準属性にあり、`show-modal` などを HTML だけで指定できる。Invoker Commands は Chrome 135／Firefox 144／Safari 26.2 から実装。[HTML button](https://html.spec.whatwg.org/multipage/form-elements.html#attr-button-command)、[互換性](https://web-platform-dx.github.io/web-features-explorer/features/invoker-commands/)|**採用**。標準 HTML の属性と既定動作を保つ。単なる開閉のための JS state／handler を要求しない。独自 state を native open state に自動変換する最適化は避け、作者が native UI を選ぶ。|
|CSS containment／content-visibility|`content-visibility:auto` はユーザーに関連しない内容の layout／paint を省略でき、内容を支援技術から一律に隠す `hidden` とは異なる。現行互換性データでは 2025-09-15 から Newly Available。[CSS Containment 2](https://www.w3.org/TR/css-contain-2/#content-visibility)、[互換性](https://web-platform-dx.github.io/web-features-explorer/features/content-visibility/)|**作者の opt-in として採用**。DOM を残したまま描画コストを抑える選択肢。contain はレイアウト意味論を変えるので compiler が勝手に付与しない。JS の無効化や無限リストのメモリ削減とは区別する。|
|`modulepreload`|モジュールの取得に加え parse／compile を先行できる。依存の再帰 preload はブラウザの裁量なので、必要なら依存の平坦なリストを出す。[Preload modules](https://web.dev/articles/modulepreload)|**採用**。Vite の出力 URL に対する任意の preload policy を用意する。初回操作を優先する entry と、コード取得まで完全遅延する entry を選べるようにする。全 handler の一括 preload はしない。|
|BFCache と page lifecycle|BFCache は DOM と JS heap／tasks を保持・停止し、復帰時に再開する。`pageshow.persisted` と `pagehide` は Chromium 専用の `freeze`／`resume` と区別できる。[BFCache](https://web.dev/articles/bfcache)|**core の正しさ要件**。BFCache 復帰時に SSR snapshot を再 decode して初期化しない。外部 resource だけ必要に応じて再接続する。bootstrap は document ごとに冪等。|
|CSP／Trusted Types／Sanitizer|Trusted Types は 2026-10-07 Working Draft。CSP で HTML 等の injection sink に型を要求できる。現行互換性データでは Trusted Types が主要エンジンに実装された一方、Sanitizer は Safari 未対応。[Trusted Types](https://www.w3.org/TR/trusted-types/)、[TT 互換性](https://web-platform-dx.github.io/web-features-explorer/features/trusted-types/)、[Sanitizer](https://wicg.github.io/sanitizer-api/)、[互換性](https://web-platform-dx.github.io/web-features-explorer/features/sanitizer/)|**生成物の契約に採用**。外部 ESM loader、コード文字列なしの snapshot、通常 binding の text／property 更新を基本にする。HTML 挿入が必要な backend は host policy と適合させる。Sanitizer を必須 runtime にしない。|
|`moveBefore()`|DOM Living Standard に状態保持 move がある。Chrome 133／Firefox 144 は実装し、Safari は未対応。focus、animation、iframe 等の状態を保持する API。[DOM](https://dom.spec.whatwg.org/#dom-parentnode-movebefore)、[互換性](https://web-platform-dx.github.io/web-features-explorer/features/move-before/)|**feature detection adapter**。keyed list の move に使える。ただし `insertBefore` fallback が focus／media／iframe／custom element の状態まで同等に保持するとは保証しない。core は node identity と scope identity を保証し、UA の状態保持保証を別に記す。|
|Declarative Shadow DOM／scoped custom element registries|DSD は Chrome 111／Firefox 123／Safari 16.4 から利用可能。scoped registry は Chrome 146 と Safari 26 に実装され、現行データでは Firefox 未対応。[DSD 互換性](https://web-platform-dx.github.io/web-features-explorer/features/declarative-shadow-dom/)、[scoped registries](https://web-platform-dx.github.io/web-features-explorer/features/scoped-custom-element-registries/)|**Web Components 相互運用 backend として任意採用**。通常の component ごとに ShadowRoot を要求しない。document 全体の単一 event delegate が shadow 境界でも万能だとは扱わない。scoped registry は microfrontend の追加機能。|
|`scheduler.postTask()`／`scheduler.yield()`|Prioritized Task Scheduling は Draft CG Report。yield 後の継続は通常の新しい同優先 task より優先される。Scheduler API の現行データでは Safari 未対応。[仕様](https://wicg.github.io/scheduling-apis/)、[Chrome 解説](https://developer.chrome.com/blog/use-scheduler-yield)、[互換性](https://web-platform-dx.github.io/web-features-explorer/features/scheduler/)|**任意 adapter**。大量の非緊急仕事を分けるために使う。small state write のたびに yield する scheduler は作らない。fallback のタイミング・優先度は完全同一ではないので、正しさが特定 task 順に依存しないようにする。|
|Navigation／View Transitions|Navigation API は HTML 標準の独立 API。same-document View Transitions は 2025-10-14 から Newly Available、cross-document は現行データで Firefox 未対応。[Navigation API](https://html.spec.whatwg.org/multipage/nav-history-apis.html#navigation-api)、[同一 document](https://web-platform-dx.github.io/web-features-explorer/features/view-transitions/)、[別 document](https://web-platform-dx.github.io/web-features-explorer/features/cross-document-view-transitions/)|**router 層の任意機能**。標準リンク・MPA・BFCache を維持できる resume core にする。初版で SPA router を必須にしない。transition 非対応時も通常遷移／DOM 更新を通す。Navigation API のバージョン別適合は router 検討時に再確認する。|
|Declarative partial updates／HTML streaming setters|`<template for>` は HTML Living Standard に規定され Chrome／Edge 150 に実装、Firefox／Safari 未対応。一方 `streamHTML` 等は現行互換性データで全 stable 未対応、参照仕様は WHATWG PR。[HTML template for](https://html.spec.whatwg.org/multipage/scripting.html#attr-template-for)、[template-for 互換性](https://web-platform-dx.github.io/web-features-explorer/features/template-for/)、[streaming setters](https://web-platform-dx.github.io/web-features-explorer/features/html-streaming-setters/)|**native backend を保留**。将来の out-of-order streaming 出力先として IR を開いておく。現時点の全環境共通 streaming 契約とは別にする。|
|TC39 Signals|公式 proposal と公式 Stage 1 一覧が Stage 1 を示す。現案の `State`／`Computed`／`subtle.Watcher` は標準化済み API ではなく、built-in `effect` も含まない。[proposal](https://github.com/tc39/proposal-signals)、[公式 Stage 1 一覧](https://github.com/tc39/proposals/blob/main/stage-1-proposals.md)|**core の依存を保留**。静的 dependency graph を native Signal object に固定しない。外部 signal library との subscribe／read／dispose adapter を後から付ける。|
|DOM Parts／Template Instantiation|DOM の更新位置を native に保持する提案と、`template.createInstance()`／`update()` 等の提案がある。2025 年末には別の DOM Templating API draft も提示され、原著者自身が未完成 draft としている。[DOM Parts](https://github.com/WICG/webcomponents/blob/gh-pages/proposals/DOM-Parts.md)、[Template Instantiation](https://github.com/WICG/webcomponents/blob/gh-pages/proposals/Template-Instantiation.md)、[新 draft](https://github.com/justinfagnani/dom-templating-api-proposal/blob/main/EXPLAINER.md)|**採用を保留**。`NodeLocation`／`RangeLocation` の internal contract は持つが、提案 API をそのまま public ABI にしない。まず標準 DOM の locator／marker で表せるようにする。|

### Inferences

- 専用文法の価値は、標準 HTML を独自 runtime で包むことではなく、どの境界に JS が必要かを確定できることにある。native UI しか使わない component が handler／effect へ到達しなければ、その component の client code と snapshot を落とせる。
- portable の判定は「同じ polyfill がある」ではなく、core の正しさが追加機能の有無で変わらないことに置く。`moveBefore` の状態保持や `scheduler.yield` の優先度のように完全再現できない差は、capability 契約へ明示する。
- View Transitions と resume は別の問題を解く。MPA に resume を適用してもよく、router を core と同時に作る必要はない。初回ロードの小ささだけでなく BFCache を壊さないことが継続利用の性能に効く、という設計判断ができる。

### Gaps

- 各 WebView／旧版 browser の対応範囲は未定。Baseline Newly Available を初版の最小対応にするか、より古い browser を含めるかは別途仕様化が必要。
- native API による bundle／latency の改善量は未計測。ネイティブであること自体を性能優位の証明にはしない。

## 2. resume の意味論に Web 標準が課す制約は何か

### Takeaway

import 待ちの event replay、BFCache 復帰、form の live state、DOM move は、SSR snapshot だけでは復元できないブラウザ状態を持つ。そこを event／scope／DOM capability のコントラクトに入れる必要がある。

### Cited Findings

- DOM の `dispatchEvent()` は `isTrusted` を false にし、dispatch 終了時には `currentTarget` と event path が消去される。HTML の activation-triggering input は trusted event を条件とし、transient user activation には UA が決める短い有効期間がある。[DOM Event](https://dom.spec.whatwg.org/#dom-event-istrusted)、[dispatch](https://dom.spec.whatwg.org/#concept-event-dispatch)、[HTML user activation](https://html.spec.whatwg.org/multipage/interaction.html#tracking-user-activation)
- input の現在値と content attribute の初期値は別であり、ユーザーが編集すると dirty value／checkedness flag が立つ。現在値への代入は selection を変化させる場合もある。[HTML input](https://html.spec.whatwg.org/multipage/input.html#dom-input-value)
- BFCache 復帰は新しい document load と異なり、停止していた JS と DOM の再開である。接続・observer 等の再開は必要な場合があるが、複数の lifecycle event を処理する場合は二重接続を避ける必要がある。[BFCache lifecycle](https://web.dev/articles/bfcache)
- state-preserving move と remove＋insert は別の DOM 操作である。`moveBefore` は保持できない条件で例外となるため、存在確認だけで常に成功するとは限らない。[DOM move](https://dom.spec.whatwg.org/#concept-node-move)
- CSP は inline event handler と script を制御する。HTML 中の script data の構文には `</script` 等の特殊な終端条件があるので、JSON を JS として評価しない設計でも HTML への安全な埋め込みは別途必要。[CSP3](https://www.w3.org/TR/CSP3/#script-src-attr)、[HTML script contents](https://html.spec.whatwg.org/multipage/scripting.html#restrictions-for-contents-of-script-elements)

### Inferences

1. **遅延 dispatch は browser event の再現と呼ばない。** loader が event 発生時に必要な primitive 値、target／scope identity、sequence を取得し、後から framework handler に渡す。新しい native event を再 dispatch して trusted 性や user activation を復元できる、と約束しない。`currentTarget` は取得時の論理 target と分けて API 化する。
2. **lazy handler と同期能力を分ける。** `preventDefault` は loader の宣言的 metadata として同期処理する。activation 必須 API、drag data、同期の cancel／propagation 判定が必要な処理は eager／sync entry に限定する。`await import()` が常に activation を失うとは限らないが、ネットワーク所要時間に依存する成功を言語の保証にはしない。
3. **form binding は live DOM を尊重する。** resume 前の入力を snapshot で上書きしない。初回接続時の読み取り方向と、後続の state→DOM 書き込みを別操作にする。value／checked／selection／IME、reset、default action の扱いを含む binding 契約が必要である。
4. **BFCache では dispatcher を再起動しない。** per-document bootstrap guard を持ち、`pageshow.persisted` のときは既存 scope と decoded state を維持する。外部 resource の reconnect は idempotent にし、pagehide を必ず scope dispose とみなさない。
5. **keyed scope の寿命と browser の状態を分ける。** keyed reorder は同じ node／scope を保持するが、fallback move で全 UA state が保存されるとは言わない。focused input、custom element callbacks、iframe、media、animation について capability ごとの受入条件を用意する。multi-node range を fragment に一度 detach する実装は state-preserving move の利益を失い得るので、range strategy も検討する。
6. **ShadowRoot は event root の境界として扱う。** document delegation だけを前提にせず、非 composed／非 bubbling event を含む型ごとの接続方法を compiler が選べるようにする。closed shadow 内の DOM location を外側 scope から直接解決する設計にはしない。
7. **HTML と snapshot の出力型を分ける。** text／attribute／URL／HTML fragment／JSON data で escaping を共通の文字列置換一つにしない。inline `onclick`、関数文字列、`eval` を生成しない。HTML sink を使う factory backend は Trusted Types の host policy と協調し、通常の scalar update は text／property API で行う。

### Gaps

- event payload の集合、lazy handler 内で利用できる event API、sync entry の構文は未確定。Web 標準から全イベントに通用する単一 replay object を導けるわけではない。
- Shadow DOM と custom element の相互運用は別バックエンドとしての検証が必要。初期 core に全面導入する理由は現時点ではない。

## 3. 最新の streaming／reactivity 提案と測定仕様をどう設計へ取り込むか

### Takeaway

2026 年の重要な追加候補は、native out-of-order HTML patching と Trusted Types の対応拡大である。一方、native Signals／DOM Parts を待つ必要はなく、IR と出力 backend の境界を保つことで将来の選択肢を残せる。

### Cited Findings

- HTML Living Standard の `template` の `for` 属性は、同じ tree にある `<?marker name="…">` の挿入点、または `<?start name="…">` の置換範囲を指定する。実際の標準本文に async content を後から送る例がある。[HTML `for`](https://html.spec.whatwg.org/multipage/scripting.html#attr-template-for)
- 標準化と出荷を区別する必要がある。`<template for>` は Chrome／Edge 150 に出荷済みだが Firefox／Safari は未対応。新しい `streamHTML()` 等は別 API 群で、互換性データでは全 stable 未対応である。Chrome 文書は 148 の experimental flag と 155 の launch 予定を記載しているが、それは全環境への出荷証明ではない。[template-for 対応](https://web-platform-dx.github.io/web-features-explorer/features/template-for/)、[setters 対応と提案参照](https://web-platform-dx.github.io/web-features-explorer/features/html-streaming-setters/)、[Chrome 文書](https://developer.chrome.com/docs/web-platform/declarative-partial-updates)
- Chrome 文書は、処理途中の marker や streaming 対象を移動すると予期しない結果になり得ること、HTML setter の fragment 解析と document 上の streaming の扱いが異なることを説明している。polyfill も parser 自体を置き換えられず、新 setters の polyfill は streaming の代わりに完了後適用する。[制限と polyfill](https://developer.chrome.com/docs/web-platform/declarative-partial-updates)
- Signals の現案は effects の schedule を framework に残している。DOM templating の新 draft は template、parts、tree-aware scheduler を組み合わせているが、未完成 draft と明記されている。これらが採用されても scope ownership／resume serialization が標準から自動で得られるわけではない。[Signals](https://github.com/tc39/proposal-signals)、[DOM Templating draft](https://github.com/justinfagnani/dom-templating-api-proposal/blob/main/EXPLAINER.md)
- Event Timing は入力から次の rendering update までの duration を記録する。INP はネットワーク待ちや他の非同期処理の最終結果すべてを測定する指標ではない。Long Animation Frames は 2026-04-28 の First Public Working Draft があり、script／rendering の長い frame を観測する API を定義する。[Event Timing](https://www.w3.org/TR/event-timing/)、[INP の範囲](https://web.dev/articles/inp)、[LoAF](https://www.w3.org/TR/long-animation-frames/)

### Inferences

- **native patching は Resume ABI の次版課題にする。** 単なる文字列 HTML backend 交換ではない。旧 scope の破棄、pending dispatch の無効化、新 DOM と snapshot の公開、handler 解決を整合させる必要がある。browser parser が自動置換する場合、framework が置換直前に必ず cleanup できるとは限らないため、「最初の stream 完了前は server 領域を書換可能、client が所有権を得た後は framework 管理」といった所有権移譲ルールを先に設計する。
- **payload readiness と DOM readiness を別に持つ。** HTML が先に現れて snapshot が未到着の区間、snapshot が先に来て DOM がまだ parser に接続されていない区間を区別する。scope ごとの readiness と queue 方針を定義し、document 全体の DOMContentLoaded に依存して全 scope を一括走査することは避ける。
- **stream と keyed mutation を同じ range に同時適用しない。** native／独自どちらの streaming backend でも、server の patch 対象 range と browser update が所有する range の衝突を禁止するか version で解決する。snapshot の buildId だけでは同一 build 内の古い async patch を防げないので、scope generation／revision が候補になる。
- **modulepreload と document speculation を分ける。** handler chunk の先読みは ESM artifact graph に沿う。Speculation Rules は document navigation のための機能であり、handler 用 JavaScript chunk の preload 代替ではない。document speculation は router／host の任意拡張に置く。[Chrome の用途区別](https://developer.chrome.com/docs/web-platform/prerender-pages)
- **測定は INP と semantic completion を併記する。** first click で軽い feedback だけ描画して import が後から完了すれば、INP と実際の操作完了は異なる。入力→dispatch→module ready→state commit→DOM commit の独自 marks を用意し、cold cache／warm cache を分ける。LoAF／Event Timing は feature detect した評価用 instrumentation とし、production core の必須依存にはしない。
- **追加の言語キーワードを急がない。** native UI、CSS、preload、router、Shadow DOM は標準 markup／host options／adapter で表現できるものが多い。専用文法の中心は引き続き state／derive／on／ownership とし、標準の仕様変更を追うたびに core 文法を増やさない。

### Gaps

- native template-for と resume の cleanup／capture graph を整合させた本プロジェクトの実装は存在せず、将来の検証項目である。WICG の README と個別 explainer の構文に古い表記が残ることもあるため、実装時は WHATWG 本文と固定した browser 版を正にする。
- WHATWG HTML PR 12758 の本文は取得がタイムアウトした。streaming setters の maturity 判定は現行互換性データが PR を参照し全 stable 未対応とすること、および Chrome 文書が experimental／計画段階とすることに限定した。
- proposal の将来採択時期と性能効果は予測しない。今は設計書に採否と ABI 上の接点を記載する段階である。
