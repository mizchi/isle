# 名前付きイベント境界を書く

docs/prototype-guide.md と docs/chunk-profiling.md を読んでから、Counter を一つ書いてください。実装、solutions、expect、過去の attempts は読まないでください。

- number の initial prop を受け、count state を初期化する。
- div 内に二つの button を置き、それぞれ count を表示する。
- 一つはクリックで +1、もう一つは -1。
- チャンクの識別名を increment と decrement にし、前に無関係なイベントを追加しても名前がずれないようにする。
- この二つの処理はネットワークを呼ばず、操作時にコードを解決する。

`evals/attempts/<run>/chunks.isle` に保存し、`node tools/eval.mjs author-chunks <file>` で採点します。初回の診断、修正回数、async が必要だと思ったか、境界の場所に迷ったかを log.md に記録してください。
