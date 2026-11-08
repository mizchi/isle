# EVAL-02: npm 利用者の help がエラーになる

> `--help`はexit2でcheckout内の実行形式を表示する。

出典: author-v1 `report.md`。diagnosis-v1 も同じ挙動を記録した。

状態: 修正済み。`isle --help` / `-h` / `layout --help` は stdout に npm bin 名で usage を表示して exit 0。未知の command は exit 2 のまま。`tests/consumer-cli.test.mjs` で Red → Green。
