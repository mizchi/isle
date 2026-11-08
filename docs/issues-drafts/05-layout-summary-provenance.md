# EVAL-05: 親の検査結果と子の必要寸法を混同する表示

> BoardのE_LAYOUT_FITが子の180pxをBoardの必要幅のように表示すること。

出典: diagnosis-v2 `report.md`。新しいsummaryは原因要素のサイズを、検査中の契約componentの名前に結び付けていた。

状態: 修正済み。サイズは反例のbox/pathに結び付け、検査対象の契約は `checked contracts: Board at Board, Tile at Board/0` のように分離して表示する。元の反例・status・JSONは変更しない。`tests/layout-syntax-cli.test.mjs` で表示の混同をRed→Greenで検査。
