# チャンクと非同期境界を読む

docs/prototype-guide.md、docs/chunk-profiling.md、このディレクトリの fixture.isle だけを読んでください。実装、expect、solutions、過去の attempts は読まないでください。

Vite の loading 指定は省略され、profile: true の想定です。次のキーで `evals/attempts/<run>/chunk-answers.json` を作ってください。

- `entries`: 論理チャンクの完全修飾名の配列。
- `loading`: コードが必要になるタイミング。lazy/preload/eager の一つ。
- `asyncMeans`: async が表しているもの。await-in-body / eager-import の一つ。
- `captureNames`: 保存対象となる props/state の名前を宣言順に並べた配列。
- `remoteAction`: 呼び出す server action 名。
- `authorization`: 必要な policy の完全名。
- `stateInitializedAgain`: 初回操作で component の state 初期化が再実行されるか。boolean。
- `restoreOnRepeat`: 同じ island の2回目の操作でも restore 計測が発生するか。boolean。
- `runDurationIsCpuOnly`: run の時間は CPU 時間だけを表すか。boolean。
- `codeCachedMeansNetworkHit`: code.cached が true なら HTTP cache hit を証明できるか。boolean。

`node tools/eval.mjs chunk-intent <chunk-answers.json>` で採点します。意味が分からなかった記号と、自信が低い回答を log.md に残してください。
