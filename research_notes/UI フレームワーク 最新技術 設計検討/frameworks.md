# 最新 UI 実装から取り入れる設計

## 1 現行実装から何が確かめられるか

### Takeaway

2026-11-02 に一次資料を確認した範囲では、細粒度 DOM 更新と server/client 別コンパイルは既に複数の実装にある。今回の設計の価値は、resume の phase・capture・依存・所有権を専用言語の制約として明示し、生成物を説明できる点に置くのがよい。以下の版情報は調査時点に観測したものを示し、全 package の最新 patch を網羅する表ではない。

### Cited Findings

|対象|調査時点で確認した状態|今回重要な実装・制約|
|---|---|---|
|Qwik|stable 1.20.3 と v2 RC 系。10/25 の core 依存は 2.0.0-rc.4、optimizer は 2.1.0-rc.10。README の beta 表記より releases が新しい|v1 と v2 資料を混ぜない。v2 の状態 lazy 復元／prewarm は初回操作コストの比較対象。[releases](https://github.com/QwikDev/qwik/releases)、[README](https://github.com/QwikDev/qwik/blob/main/README.md)|
|Marko|6 系の現行実装・継続リリースを確認。9月は compiler/runtime/tooling 合計25 releases。Patch Protocol は未公開の実験|静的 dependency graph、snapshot、DOM marker、client bundle の結合最適化。[9月公式更新](https://markojs.com/docs/newsletter/september-2026)、[Patch Protocol](https://markojs.com/docs/explanation/patch-protocol)|
|Svelte|5 の runes が現行。await 式は `experimental.async` が必要で、flag は Svelte 6 で除去予定|コンパイラ型でも derived/effect の依存は実行時 read tracking。async を既成の安定仕様とみなさない。[$derived](https://svelte.dev/docs/svelte/$derived)、[await](https://svelte.dev/docs/svelte/await-expressions)|
|Solid|2.0 は8/13の公式RC発表を確認。従来系と新しい async model を区別|Promise/Async Iterator が reactive graph に入り、microtask batching と compute/apply effect 分離を導入。[RC発表](https://github.com/solidjs/solid/discussions/2995)|
|Vue|stable は3.5.44、Vapor は3.6.0-rc.13（10/23）。3.6 RC で Vapor は feature-complete と記載|Vapor は opt-in の subset。VDOM 互換を入れると VDOM runtime が戻る。[releases](https://github.com/vuejs/core/releases)、[rc.13](https://github.com/vuejs/core/releases/tag/v3.6.0-rc.13)、[Vapor説明](https://github.com/vuejs/core/releases/tag/v3.6.0-rc.1)|
|React|Compiler 1.0 は2025/10/7にstable。RSCの利用側はReact19でstableだが、framework/bundler実装用APIはminor間で変わり得る|自動memoization、診断、server/client module境界を参考にする。RSC transportの互換実装は初期目標にしない。[Compiler](https://react.dev/blog/2025/10/07/react-compiler-1)、[RSC](https://react.dev/reference/rsc/server-components)|
|Angular|現行docsではv21以降zonelessが既定。incremental hydrationは`provideClientHydration()`で既定、event replayを含む|全非同期処理の監視ではなく明示通知を使う。準備前イベントとdeferred境界を仕様化する。[zoneless](https://angular.dev/guide/zoneless)、[incremental hydration](https://angular.dev/guide/incremental-hydration)|
|Astro|現行docsのclient/server islandsを参照|static HTMLの上にinteractive部分を分ける。server islandは別endpointのHTML取得で、resumeとは別の境界。[islands](https://docs.astro.build/en/concepts/islands/)、[server islands](https://docs.astro.build/en/guides/server-islands/)|

- Marko の実装資料は、一つの graph から retained DOM modules・SSR scope payload・DOM/range markers・lazy ready streams を生成すると説明する。`sections`、`bindings`、`references`、serialization reason の伝播、ID割当を明確に分け、raw compiler output だけでなく最適化後 Rolldown output と Brotli size を検査する。[RESUMABILITY.md](https://github.com/marko-js/marko/blob/main/packages/runtime-tags/RESUMABILITY.md)
- Marko の `src/translator/util/reasons.ts` は、slot をなぜ serialize／更新するのかを state／param／always の sources で表現する。owner slot への reason 伝播や callsite の param 置換も行う。必要性を単なるbooleanにせず、原因を保持する実装である。[reasons.ts](https://github.com/marko-js/marko/blob/main/packages/runtime-tags/src/translator/util/reasons.ts)
- Vue Vapor の pinned source `v3.6.0-rc.1/packages/compiler-vapor/src/transform.ts` では、template登録とblock operation/effect IRが分かれる。定数式を effect 候補から除き、操作順序やcleanupを必要とするlistenerも扱う。現在の `minor` source も expression と operations の対応を明示している。[pinned transform.ts](https://github.com/vuejs/core/blob/v3.6.0-rc.1/packages/compiler-vapor/src/transform.ts)、[minor transform.ts](https://github.com/vuejs/core/blob/minor/packages/compiler-vapor/src/transform.ts)
- Svelte の `$derived` は同期的に読んだ値を依存とし、dirty化して次のread時に評価する。`$effect` は間接的な関数呼出内のreadも追跡する。コンパイラがあることと、dependency graphが静的に確定することは同義ではない。[$derived](https://svelte.dev/docs/svelte/$derived)、[$effect](https://svelte.dev/docs/svelte/$effect)
- React Compiler は React の既存意味論を保った自動memoizationを行い、unsupported pattern は診断し該当componentをskipする。lintはpurity、immutability、static component、ref、render/effect内state更新などを検査する。[Compiler 1.0](https://react.dev/blog/2025/10/07/react-compiler-1)、[compiler diagnostics](https://react.dev/reference/eslint-plugin-react-hooks)

### Inferences

- 「最新frameworkは全て静的へ収束」とは言えない。直接DOM・compiler・fine-grained graphは共通する一方、Svelte/Solid/Vueは柔軟なruntime trackingも選んでいる。本言語は互換性より静的制約を優先する、という設計上の選択を明記する。
- Reactive IRは`value/read/write`だけでは不足する。`owner`、`effect`、`event entry`、`async generation`、`server/client phase`、`retention reason`を別の関係として保持する案を採る。
- `explain`には「なぜslot/marker/helperが残ったか」を参照元まで遡るchainを出す。これは生成コードを読むだけでは追いにくいresumeの運用を助ける。
- Reactの安全なskipは互換移行のための方針である。ユーザーは制約を了承済みなので、本言語ではunsupported dependency/captureを暗黙fallbackせずcompile errorにする。

### Gaps

- package registryを全件調査していないため、Marko/Svelte/Solid/Astroの全packageの最新patch番号は確定していない。採用時にはversion/commitを固定し直す。
- 生成UIの速度順位は測定していない。Vapor/Marko等の宣伝的benchmark値は、異なる条件を横並びにする根拠にしない。

## 2 async と ownership と未準備イベントから何を取り入れるか

### Takeaway

runtimeを小さくするには、捨てられない責務を先に定義する必要がある。scopeの生存期間、同期イベント、入力値、古いasync結果、streaming中の操作を曖昧にすると、直接DOMの生成コードだけ速くても実用上の正しさが崩れる。

### Cited Findings

- Solid 2 RC は async をgraphの性質にする。state変更中は古いcontentを表示しつつpendingを示し、すべてのwriteをmicrotaskでbatch、必要時に`flush()`する。effectは追跡対象のcomputeとside-effectのapplyを分ける。この新モデルはRCであり、本言語がそのまま互換実装すべき確定標準ではない。[Solid 2 RC](https://github.com/solidjs/solid/discussions/2995)
- Svelteのawait式は、依存stateとasync結果を同時に反映して不整合を防ぐ規則を説明する。独立したasync作業の並行性も扱う。await後の依存追跡にはコンパイラ変換が入るため、単純な同期read-setの延長ではない。[await式](https://svelte.dev/docs/svelte/await-expressions)
- Solidの`createRoot`はowned contextを作り、disposeを呼ぶまでcomputationを保持する。disposeを取らないunowned rootにはmemory leakの注意がある。[createRoot](https://docs.solidjs.com/reference/reactive-utilities/create-root)
- Svelteの`effects.js`は親子effectとDOM rangeを保持し、破棄時にchild・reaction・transition・teardownを処理する。childのAbortControllerもabortする。状態の依存graphとは別に寿命管理が存在する。[effects.js](https://github.com/sveltejs/svelte/blob/main/packages/svelte/src/internal/client/reactivity/effects.js)
- Angularのincremental hydrationは、境界のdependency取得とhydrationまでユーザーeventをqueueし、準備後にreplayする。triggerにはinteraction・hover・viewport等がある。これはhydrationでありresumeではないが、見えているUIと準備状態の差を扱う参考になる。[incremental hydration](https://angular.dev/guide/incremental-hydration)、[event replay](https://angular.dev/guide/hydration#capturing-and-replaying-events)
- Qwikはeventを非同期処理するため、`preventDefault`等の同期操作に別契約がある。`sync$`はcapture/import不可でHTMLへinlineされる制約がある。宣言的`preventdefault`も提供する。[sync events](https://next.qwik.dev/docs/advanced/sync-events/)
- Vue Vaporはeligible eventをdocumentへdelegateする。祖先の`stopPropagation()`によりdocumentへ届かなければhandlerは走らない。動的event等には直接listenerを付ける経路がある。[Vapor event delegation](https://github.com/vuejs/core/releases/tag/v3.6.0-rc.1)
- Qwik v2のstate prewarmは通常lazyに復元するstate rootsを、必要な場合だけ早期に分割処理する。既定はdisabledで、総仕事量の削減ではなくfirst-accessのlong task回避が目的。小さいsnapshotには不要な仕事を増やし得る。[State Prewarm](https://next.qwik.dev/docs/advanced/state-prewarm/)
- Markoはin-orderとout-of-order streamingを区別し、後者ではplaceholderと少量のclient処理でHTMLを正しい場所へ入れる。placeholderの寸法不足によるCLSやproxy bufferingにも注意がある。[HTML streaming](https://markojs.com/docs/explanation/streaming)

### Inferences

- **ownershipを採用**：`scope`はstateだけでなくDOM range・listener・effect・pending dispatch・async workを所有する。keyed itemの移動はidentityを保ち、削除はそのownerを一度だけdisposeする。static locationとdynamic instance IDは引き続き別にする。
- **compute/applyを採用**：純粋なderive評価、DOM write、user effectをphase分離する。DOM測定とDOM変更を任意に混ぜるgeneral effectを初期仕様に入れず、許可する場合は実行時機を明示する。
- **commit境界を採用**：一つの同期handler内のwriteをtransactionにまとめ、derivedを静的順序で評価しDOMをcommitする。即時readが更新後stateを読むか、DOMがいつ追随するかを言語仕様で固定する。microtaskを使うかは未決定とし、Solid2の「全write遅延」を無条件コピーしない。
- **asyncの世代管理を設計要件にする**：ownerとrevision/tokenを持ち、遅く終わった過去のrequestは新しいstateへcommitしない。abortは最適化に使い、正しさはrevision確認でも担保する。Promise continuation自体をsnapshot保存する設計にはしない。
- **イベントを分類する**：通常のlazy handler、同期metadata操作、事前にeager登録が必要なhandlerを区別する。load中連打の順序、scope消滅、load失敗、複数handlerの伝播を仕様化する。再dispatchしたEventが元のtrusted user activationを復元する、という前提を置かない。
- **live formを優先する**：loader稼働前・chunk load中のinput値とselectionを、SSR snapshot値で上書きしない。イベント時点の値の記録とdispatch時点の現在値のどちらを渡すかをevent種別ごとに決める。
- **state decodingを分割可能にする**：snapshotをscope単位に区切り、全graphの同期復元を必須にしない。prewarmはABIに必須化せず、profilingに基づくruntime policyとして追加する。
- **streamingは段階追加**：stream中にreadyとなったscopeだけresume可能にする。snapshot/DOM markerが未到着のscopeへeventを送らない。out-of-order patchとclient updateの競合は、owner/revision仕様が定まるまで初期実装範囲へ入れない。

### Gaps

- Shadow DOMのretargeting、非bubble/composed event、trusted activationの正確な規則はWeb標準調査との統合が必要。delegationを全eventに適用できるという結論は出していない。
- async deriveを言語の基本要素にするか、明示resource boundaryに分けるかは未決定。RC段階のSolid2とexperimental Svelte awaitを根拠に初期仕様を肥大化させない。

## 3 採用 保留 見送りと設計書への差分

### Takeaway

今採る価値が高いのは、共通graphからの必要性解析、ownerによる寿命管理、event/commitの明示契約、最適化理由の説明である。server-driven navigationや全async graphの実装は、基本resumeの正しさと独立させて保留する。

### Cited Findings

- Marko Patch Protocolは公式にexperimental・まだ試せないとされる。state/focusを保持してserver差分を適用するが、patch各部をJavaScript評価しCSPの`unsafe-eval`を要する。router/runtime/markerの追加量もある。これは本設計のno-eval・標準ESMの方針へそのまま移植する対象ではない。[Patch Protocol](https://markojs.com/docs/explanation/patch-protocol)
- Astro server islandsは各islandを専用routeへ分離し、browserがHTMLを取得する。slow islandが他の個別contentを待たせず、host infrastructureに依存しない構成を目指す。一方propsのserializable集合とbuild間の暗号key整合などの制約がある。[server islands](https://docs.astro.build/en/guides/server-islands/)
- React RSCはserver側で実行するmoduleをclientへ送らず、client componentとの境界を持つ。利用APIのstableとbundler向け内部APIの不安定さは別である。[Server Components](https://react.dev/reference/rsc/server-components)
- Vue VaporのVDOM interopは、他方式との混在を可能にする一方でVDOM runtimeを引き込みbundle削減を相殺し得る。slot関数の呼出もDOM/effect生成等を伴うため、結果を見るためのdry runとして使えない。[Vaporの互換制約](https://github.com/vuejs/core/releases/tag/v3.6.0-rc.1)

### Inferences

以下は研究者の設計提案であり、実装済み機能や測定結果ではない。

|機構|判断|設計書に入れる内容|
|---|---|---|
|必要性の共通graphと原因追跡|採用|code・snapshot・marker・virtual moduleを同じ到達性解析から生成。`why retained`を出す|
|静的DOM操作IR・template pooling|採用|SSR string writer／browser DOM backendを分離。定数template・定数operationを分ける|
|owner tree / range lifetime|採用|scope削除時のeffect・listener・pending taskのdispose順と再入規則|
|pure compute / apply effect分離|採用|deriveは純粋、effectの実行phaseとcleanupを契約化|
|transaction / deterministic commit|採用|write直後read、batch境界、DOM反映順序、effect順序を明文化|
|準備前eventのqueueとsync境界|採用|event種別表、default action、順序、load失敗、input値保持|
|lazy state復元とprewarm|復元単位は採用、prewarmは保留|scope単位decodeを可能にし、早期復元policyはprofile後|
|async revision / cancellation|契約を採用、機能は段階追加|古い結果のcommit防止、owner削除、streamとの競合を定義|
|islands / third-party renderer連携|明示境界で後続|全域の相互運用を避け、opaqueな所有領域・props・event契約で接続|
|server差分navigation / RSC互換wire|保留|標準link/formを基線にし、将来data-only versioned patchを検討。eval wireは見送り|

性能評価の対象も増やす。静的HTMLとCounterだけでなく、(a)大snapshotの最初のevent、(b)chunk未取得中の連打・入力、(c)branch削除後のasync完了、(d)keyed reorder時のfocus/selection、(e)stream中の操作、を将来の適合fixtureにする。これらは今は設計項目として記録するだけで、コードやtest実装は始めない。

### Gaps

- すべての機能を最初のruntimeへ入れるとbaselineが大きくなる。feature別runtime importが本当にRolldownで除去されるかは、後のproduction bundle検証を要する。
- foreign renderer、client effect、async boundaryまで含むresume snapshotの最小形式は未確定。基本ABIへ拡張可能性を残しつつ、v1で全codecや全transportを引き受けない。
- このノートは実装と公式技術説明の調査であり、学術研究・Web標準の詳細は他の調査ノートと統合して判断する。
