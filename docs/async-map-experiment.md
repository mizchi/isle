# 非同期の地図UIを作る実験

現在のIsleで、地図の移動・ズーム・検索・詳細取得を持つUIを構築した。[Harborのソースと起動手順](../examples/async-map/README.md)を使う。36件の場所と街区は生成した架空のデータで、Google MapsやOpenStreetMapのAPIは使っていない。

結果は、**外部UIをresource adapterとして接続できた**というもの。非同期の結果と状態遷移をDSLで宣言し、コンパイラに解析・生成させる部分は不足している。今回、言語構文や共有runtimeへの機能追加は行っていない。

## 所有する境界

| 部分 | 所有者・実装 |
|---|---|
| 初期HTML、検索値、カテゴリ、開始状態、Show、key付きFor | `app.isle`。型検査と更新コード生成の対象 |
| 地図・結果・詳細の3つの空DOM領域 | trustedな`setup.mjs`以下。compilerは内部を書き換えない |
| viewport、非同期結果、選択、保存、cache | DOM非依存の`model.mjs` |
| 検索・詳細の取得 | `transport.mjs`。同一originのJSONと180msの制御遅延 |
| Pointer capture、wheelの同期キャンセル、Canvas、ResizeObserver | adapter。イベント中に処理し、描画をrAFへまとめる |
| SDK相当のsetup、listener・observer・timer・取得の破棄 | Isleの既存resource ownerへ登録 |
| 詳細画面のコード | Viteのdynamic import。詳細データの取得と並列に開始 |

DSLの検索値・カテゴリはrootの`data-*`へ出し、adapterがMutationObserverで受け取る。adapterからDSL stateへ非同期の結果を戻すtyped入口がないため、検索結果にはDSLのForを使っていない。結果の描画、keyによるnode再利用、選択表示もadapter側にある。このDOM境界はアプリの約束で、言語のopaque DOM契約として検査されたものではない。

カテゴリボタンにはForを使い、5つのボタンで1つの`filter`入口を共有する。検索値の変更でカテゴリのnodeを作り直さない。固定のrecord配列を型注釈付きderiveとして宣言する案は、現状のcontextual typingでは`E_TYPE`になったため、書込みのない初期stateとして置いた。固定リストの展開とliteral captureの特殊化には最適化の余地がある。

## 非同期の採用条件

検索と詳細の2チャネルに、それぞれversionとAbortControllerを持つ。入力・viewport変更で古い検索を中止し、新しい要求を作る。結果の採用前にownerの生存とversionを照合し、値も検査する。

```text
publish(result) := owner is alive AND result.version = channel.version
```

abortを要求しただけでは、相手が停止するとは限らない。テスト用transportはabortを無視して旧結果を返すため、それでも上書きされないことを検査できる。unmountでは両チャネルを先に無効にし、listener、observer、rAF、timer、Canvasを破棄する。モデルの`settled()`は残るデータ要求の完了を待つ。非協調的な要求が永遠に終わらなければ、完了待ちも終わらない。viewコードのimport自体はcancelせず、到着後にownerと現在の選択を確認して公開を防ぐ。

入力は待機中でも編集できる。失敗時は前の結果を残して再試行を提供する。検索と詳細は互いの待機を直列化しない。取得済みの詳細はsession内cacheで再利用する。状態はsnapshotへ再保存せず、再訪時は新しい地図として始める。

[Pointer Events標準](https://www.w3.org/TR/pointerevents3/#the-setpointercapture-method)に従ってpointer captureを使い、指がCanvasの外へ動いても追跡する。wheelの`preventDefault`とcaptureはadapterの同期listener内で実行する。これらを遅延handlerへそのまま移せるとは仮定しない。

## 検証したこと

- 検索と詳細の応答逆転、失敗・再試行、cache、2つのsessionの独立性。
- 3要求の6通りの完了順 × 4箇所の破棄タイミングの24 scheduleで、最新の結果だけを採用する有限検査。
- production buildで、初期表示時にadapter・検索JSON・詳細コードを取得しない。
- ドラッグ、ホイール、矢印キー、Home、タッチの2点ピンチ。結果のDOM identityを保持する再検索。
- 詳細データを先に返し、viewのコードだけを止める試験。コード到着時に現在の選択を描画する。
- native DOM削除で進行中の要求を中止し、一度だけcleanupする。複数mountの片方を削除しても他方は動く。
- 初回paintと最初のresumeのraw layout shiftが0。地図・結果領域のサイズを先に確保する。
- SSR-onlyではJS・snapshot・setup・検索/詳細JSONを出力しない。

[単体・有限検査](../tests/async-map.test.mjs)、[build検査](../tests/async-map-build.test.mjs)、[ブラウザ検査](../e2e/async-map.spec.mjs)を用意した。これはcompiler全体の形式証明でも、全ブラウザでの保証でもない。実SDK、ネットワーク越しの本番API、ルーティング、実地理の投影・日付変更線、永続化は対象外。

## サイズと負荷の観測

```sh
just async-map-check
just async-map-eval
just async-map-quality
```

[機械測定の結果](../evals/results/async-map/latest.json)に、HTML / snapshot、初期・開始後・詳細表示後の累積JS、実際の要求、raw CLS、入力からデータ採用までの時間、ドラッグ中/終了後の要求数、ソース行数を保存する。gzipはlevel 6でファイルごとに圧縮した合計で、HTTP転送量そのものではない。要求されなかったmanifest・cost reportは初期JSに足さない。

| 指標 | 観測 |
|---|---:|
| 初期JSのgzip合計 | 約1.0 KB |
| 地図開始後の累積JS gzip合計 | 約13.6 KB |
| 詳細表示後の累積JS gzip合計 | 約14.1 KB |
| snapshot JSON | 217 bytes |
| 初期表示・初回resumeのraw CLS | 0 |
| ドラッグ中 / 終了後の検索要求 | 0 / 1 |
| panに伴う追加JS | 0 files |

KBは1,000 bytes。JSにはIsleのloader/runtime、アプリのadapter・モデル・viewを含む。HTML/CSS/SVG/JSONは別で、初期に実際に要求された全ファイルのgzip合計は約7.2 KB。正確なbytesは`browser.initialPayload`へ記録する。sourceはDSL 49行、モデル・transport・renderer・setup・詳細viewが合計299行。今回の実装で共有runtimeのサイズは増やしていない。

viewportだけが変わる経路では、検索状態・行のARIA属性を更新しない。ブラウザの回帰検査で、12回のpointer moveに伴う不要な属性書込み24回を検出し、0に削減した。Canvasの描画と結果DOMの更新を分離したadapter内の改善であり、compilerが生成した最適化ではない。

これは制御したローカル条件の1回の診断で、速度のフレームワーク比較やP50ではない。初回データ採用までの時間は人為的な180ms遅延を含む。CPUはその後のpanと初回詳細表示だけを別phaseでsamplingする。約1ms単位の推計で、短い関数のsampleが0でも仕事が0とはいえない。原本は再実行時の`test-results/async-map-profile/pan-details.cpuprofile`に置く。

ソース行数はDSLと、モデル・transport・描画・接続・詳細viewを分ける。CSS、data、テストはlogic行数に含めない。地図エンジンがCanvasを所有すること自体は妥当だが、結果リストと非同期状態までadapterへ流れた量は、言語側の不足を測る材料になる。

画面品質はvlmkitのintegrity、copy、scroll、handlers、interactions、contrast、breakpoints、responsiveを検査し、[結果](../evals/results/async-map/quality.json)を保存する。390pxと1440pxの初期・開始後・詳細表示も目視確認する。Gridとサイズ確保を使うが、Canvasと外部DOMを含む画面全体のlayoutをZ3で証明したとは扱わない。

## 次に言語へ持ち込む機能

優先するのは、**key・owner・versionと結び付いたtyped resource結果の入口**。結果とpending/errorをDSL stateへ戻し、結果リストをForへ移す。古い結果の抑止を生成できれば、今回の手書きversion管理とdata属性・MutationObserverの接続を減らせる。

次に、opaque DOM領域の所有契約と、owner間のread-only live入力を接続する。検索・地図・詳細を別のclient ownerへ分けても、データの更新と独立したresumeを保てるようにする。高頻度のviewport描画はadapterへ残し、低頻度の意味的なcamera/selection変更だけをtypedな入口へ渡す。

実SDKへ置き換える場合も、コードの取得・評価と、instanceの生成・破棄を分ける。[Google Mapsの公式loader](https://developers.google.com/maps/documentation/javascript/load-maps-js-api)は必要なlibraryの非同期取得と並列取得を提供する。今回の実験は、そのAPIとの実接続を検証したものではない。
