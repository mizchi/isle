# 非同期の地図UIを作る実験

現在のIsleで、地図の移動・ズーム・検索・詳細取得を持つUIを構築した。[Harborのソースと起動手順](../examples/async-map/README.md)を使う。36件の場所と街区は生成した架空のデータで、Google MapsやOpenStreetMapのAPIは使っていない。

外部UIのresource adapterに加え、**非同期結果をDSL stateへ戻すresource channel**を実装した。結果一覧・件数・loading/error・選択表示をDSLへ移した。検索条件を伝えるDOM属性のMutationObserverと、結果カードを手で再利用する処理を削除した。Canvasと詳細画面は引き続きadapterが所有する。

## 所有する境界

| 部分 | 所有者・実装 |
|---|---|
| 初期HTML、検索値、カテゴリ、開始状態、Show、key付きFor | `app.isle`。型検査と更新コード生成の対象 |
| 結果一覧・件数・loading/error・選択表示 | `resource results(query, category)`の受信bodyとkey付きFor。型検査と更新コード生成の対象 |
| 地図・詳細の空DOM領域 | trustedな`setup.mjs`以下。compilerは内部を書き換えない |
| viewport、SDK結果のmirror、選択・保存、cache・要求世代 | DOM非依存の`model.mjs`。結果をchannelからDSLへ公開 |
| 検索・詳細の取得 | `transport.mjs`。同一originのJSONと180msの制御遅延 |
| Pointer capture、wheelの同期キャンセル、Canvas、ResizeObserver | adapter。イベント中に処理し、描画をrAFへまとめる |
| SDK相当のsetup、listener・observer・timer・取得の破棄 | Isleの既存resource ownerへ登録 |
| 詳細画面のコード | Viteのdynamic import。詳細データの取得と並列に開始 |

DSLの検索値・カテゴリをresourceのkeyとして宣言し、adapterが`channel("results").subscribe`から受け取る。結果を`task.publish`で公開すると、閉じた型を検査・copyし、生成した受信handlerでstateとForを更新する。rootの`data-query`等は検査用に残すが、動作の接続には使わない。Canvasと詳細のDOM境界はアプリの約束で、言語のopaque DOM契約として検査されたものではない。

カテゴリボタンにはForを使い、5つのボタンで1つの`filter`入口を共有する。検索値の変更でカテゴリのnodeを作り直さない。固定のrecord配列を型注釈付きderiveとして宣言する案は、現状のcontextual typingでは`E_TYPE`になったため、書込みのない初期stateとして置いた。固定リストの展開とliteral captureの特殊化には最適化の余地がある。

## 非同期の採用条件

検索と詳細のSDKモデルには引き続きversionとAbortControllerを持つ。その上でDSLのresource channelは、key変更・viewportからのrefreshでtaskを更新し、旧taskのownerをdisposeする。検索fetchにはSDK側とtask側のsignalを`AbortSignal.any`で接続する。受信コードの到着後とstate/DOM commit直前に、ownerの生存・task epoch・publication順を照合する。[契約と構文](resource-channels.md)を参照。

```text
commit(result) := owner alive AND current task epoch AND latest accepted publication
```

abortを要求しただけでは、相手が停止するとは限らない。テスト用transportはabortを無視して旧結果を返すため、それでも上書きされないことを検査できる。unmountでは両チャネルを先に無効にし、listener、observer、rAF、timer、Canvasを破棄する。モデルの`settled()`は残るデータ要求の完了を待つ。非協調的な要求が永遠に終わらなければ、完了待ちも終わらない。viewコードのimport自体はcancelせず、到着後にownerと現在の選択を確認して公開を防ぐ。

受信コードの取得をownerのイベントqueueの外で行うため、入力はコード・データの待機中でも編集できる。失敗時は前の結果を残して再試行を提供する。検索と詳細は互いの待機を直列化しない。取得済みの詳細はsession内cacheで再利用する。状態はsnapshotへ再保存せず、再訪時は新しい地図として始める。

[Pointer Events標準](https://www.w3.org/TR/pointerevents3/#the-setpointercapture-method)に従ってpointer captureを使い、指がCanvasの外へ動いても追跡する。wheelの`preventDefault`とcaptureはadapterの同期listener内で実行する。これらを遅延handlerへそのまま移せるとは仮定しない。

## 検証したこと

- 検索と詳細の応答逆転、失敗・再試行、cache、2つのsessionの独立性。
- SDKモデルとresource channelのそれぞれに、3要求の6通りの完了順 × 4箇所の破棄タイミングの24 scheduleで最新の結果だけを採用する有限検査。
- 受信チャンクを止めたまま検索を2回変更し、最後の結果だけをForへ反映。unmount後に受信チャンクが届いてもDOMを更新しない。
- production buildで、初期表示時にadapter・検索JSON・詳細コードを取得しない。
- ドラッグ、ホイール、矢印キー、Home、タッチの2点ピンチ。結果のDOM identityを保持する再検索。
- 詳細データを先に返し、viewのコードだけを止める試験。コード到着時に現在の選択を描画する。
- native DOM削除で進行中の要求を中止し、一度だけcleanupする。複数mountの片方を削除しても他方は動く。
- 初回paintと最初のresumeのraw layout shiftが0。地図・結果領域のサイズを先に確保する。
- SSR-onlyではJS・snapshot・setup・検索/詳細JSONを出力しない。

[SDKの単体・有限検査](../tests/async-map.test.mjs)、[resource channelの検査](../tests/resource-channels.test.mjs)、[build検査](../tests/async-map-build.test.mjs)、[ブラウザ検査](../e2e/async-map.spec.mjs)を用意した。これはcompiler全体の形式証明でも、全ブラウザでの保証でもない。実SDK、ネットワーク越しの本番API、ルーティング、実地理の投影・日付変更線、永続化は対象外。

## サイズと負荷の観測

```sh
just async-map-check
just async-map-eval
just async-map-quality
just async-map-input-eval
```

[機械測定の結果](../evals/results/async-map/latest.json)に、HTML / snapshot、初期・開始後・詳細表示後の累積JS、実際の要求、raw CLS、入力からデータ採用までの時間、ドラッグ中/終了後の要求数、ソース行数を保存する。gzipはlevel 6でファイルごとに圧縮した合計で、HTTP転送量そのものではない。要求されなかったmanifest・cost reportは初期JSに足さない。

| 指標 | 観測 |
|---|---:|
| 初期JSのgzip合計 | 約1.0 KB |
| 地図開始後の累積JS gzip合計 | 約15.4 KB |
| 詳細表示後の累積JS gzip合計 | 約16.0 KB |
| snapshot JSON | 233 bytes |
| 初期表示・初回resumeのraw CLS | 0 |
| ドラッグ中 / 終了後の検索要求 | 0 / 1 |
| panに伴う追加JS | 0 files |

KBは1,000 bytes。JSにはIsleのloader/runtime、アプリのadapter・モデル・viewを含む。HTML/CSS/SVG/JSONは別で、初期に実際に要求された全ファイルのgzip合計は約7.3 KB。正確なbytesは`browser.initialPayload`へ記録する。sourceはDSL 64行、モデル・transport・renderer・setup・詳細viewが合計284行。前版（commit `3ece3fc`）の開始後は13,578 bytes、詳細表示後14,116 bytes、snapshotは217 bytesだった。typed resourceを追加した`9d78974`では開始後15,000 bytesになった。今回のimmutable入力共有はさらに418 bytesを加え、15,418 bytesになった。初期loaderは約1.0 KB（今回1,017 bytes）で、channelを使わない通常のproduction buildではchannel管理を除去する。

viewportだけが変わる経路では、検索状態・行のARIA属性を更新しない。ブラウザの回帰検査で、12回のpointer moveに伴う不要な属性書込み24回を検出し、0に削減した。Canvasの描画と結果DOMの更新を分離したadapter内の改善であり、compilerが生成した最適化ではない。

これは制御したローカル条件の1回の診断で、速度のフレームワーク比較やP50ではない。初回データ採用までの時間は人為的な180ms遅延を含む。CPUはその後のpanと初回詳細表示だけを別phaseでsamplingする。約1ms単位の推計で、短い関数のsampleが0でも仕事が0とはいえない。原本は再実行時の`test-results/async-map-profile/pan-details.cpuprofile`に置く。

ソース行数はDSLと、モデル・transport・描画・接続・詳細viewを分ける。CSS、data、テストはlogic行数に含めない。地図エンジンがCanvasを所有すること自体は妥当だが、結果UIをDSLへ移す前後の差を、言語側の不足と導入コストを測る材料にする。

画面品質はvlmkitのintegrity、copy、scroll、handlers、interactions、contrast、breakpoints、responsiveを検査し、[結果](../evals/results/async-map/quality.json)を保存する。390pxと1440pxの初期・開始後・詳細のloading/ready表示も目視確認した。Gridとサイズ確保を使うが、Canvasと外部DOMを含む画面全体のlayoutをZ3で証明したとは扱わない。

## 結果配列の共有

メッセージ自体は全fieldを渡すまま、深くfreezeされた変更のない値を、検査済みの切り離したコピーとして再利用する。地図のモデルは既に結果配列と各recordをfreezeしているため、DSLやadapterへ追加の注釈は不要だった。

同じ結果配列を使うと、生成setterがrowsへの同一値の代入を省く。loading/errorだけの変更ならForを走査せず、選択変更では既存frameの選択bindingを更新する。古い配列を再検査・copyしてkeyを再照合する必要はない。[変更前の測定](../evals/results/async-map/before-sharing.json)と[現在の測定](../evals/results/async-map/latest.json)で、36件から1件を選んだときの変更のない`data-place`属性の参照が36回→0回になった。nodeのidentityと選択のARIA更新は維持している。

`browser.selection.unchangedRowAttributeReads`は、DOMの`getAttribute`を一時的に計装した観測で、全JS処理数や描画時間ではない。検索中の状態だけが変わる検査では、行のdata属性・選択属性の参照がともに0になる。受信body自体や選択に依存するbindingの処理を全部省いたわけではない。

通常の可変配列には従来のvalidationとnative `structuredClone`を使い、浅いfreezeをdeep freezeと誤認しない。共有したコピーもfreezeし、mutableな原本や受信側の変更からcacheを保護する。cacheはowner/channelごとに元の値と型で区別し、元の値には弱い参照を使う。

[入力コピーのマイクロベンチ](../evals/results/async-map/input-sharing.json)は、可変・浅いfreeze・deep freezeの36件/1,000件を比較する。2経路を各測定ペアで交互に実行し、cacheが空の最初のcopyとwarmup後100回×5組を記録する。元データの生成とfreeze、ネットワーク、受信handler、DOM更新は含めない。

36件のdeep freezeでは、warm時のvalidation/copy中央値が約0.030ms→約0.001msだった。一方、初回は約0.030ms→約0.06msで、共有を証明してcacheを作るコストがある。可変配列は約0.029ms、浅いfreezeは約0.031ms→0.035msだった。結果は1回のローカル測定で、JSエンジンや負荷によって変動する。フレームワーク全体の速度やcold engineの比較とは扱わない。

cacheを型単位にまとめ、行ごとのMap本体生成を除いた。JavaScriptのcache用Map/WeakMapコンストラクタを数えると、36件と1,000件のどちらも初回は計3個、同じ入力の再公開では0個だった。cache entry・DTO copy・native内部の割当てやGC、heap bytesを数えた結果ではない。

このcodecはstructuredなresource入力があるbuildだけへ出力する。primitiveだけのchannelと、resource channelを使わない通常のbuildからは除去する。共有widget engineは後続のアプリにも対応するため機能を含む。snapshot・CodeRef・engineのABIは変更していない。

## 残る境界

typed resource結果の入口と、Forでの結果描画まで実装した。adapterのTS型は手動で、DSLからの型生成はまだない。SDKモデル側の結果mirror、検索・詳細の要求世代、cacheも残っている。receiverへは結果全体を渡すが、深くfreeze済みのrowsは再利用する。部分メッセージやreceiver内の計算単位でのmemo化は未対応で、型生成と合わせて次の改善候補になる。

opaque DOM領域の所有契約と、owner間のread-only live入力も未実装。検索・地図・詳細を別のclient ownerへ分ける段階で必要になる。高頻度のviewport描画はadapterへ残し、低頻度のcamera/selection変更だけをtypedな入口へ渡す。

実SDKへ置き換える場合も、コードの取得・評価と、instanceの生成・破棄を分ける。[Google Mapsの公式loader](https://developers.google.com/maps/documentation/javascript/load-maps-js-api)は必要なlibraryの非同期取得と並列取得を提供する。今回の実験は、そのAPIとの実接続を検証したものではない。
