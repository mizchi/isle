# EVAL-03: 診断の量が原因を隠す

> 親Gridやmedia条件の行、408pxの算式は示されず、CLI全文は8492行。同文がbuildで4回続く。

出典: diagnosis-v1 `report.md`。author-v1 も短い検証要約を要求した。

状態: 部分修正。`isle layout ... --summary` で status、区間、宣言instance件数、要素のファイル・行・列、重複をまとめたpathを表示する。元のJSONは無指定 / `--json` で維持する。unknown の理由も出力し失敗を維持。CLIだけのモジュールでruntimeの追加なし。

未対応: 親 grid / media 宣言まで遡る原因の対応付け、境界値の算式の自動導出、Vite build の重複表示の集約。現在の行位置は違反要素の位置であり原因行とは断定しない。

`tests/layout-syntax-cli.test.mjs` で violated / verified / unknown、JSON互換、反復4件の集約を検査。
