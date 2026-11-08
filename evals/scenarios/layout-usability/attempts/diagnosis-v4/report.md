1roundで合格。変更はmedia境界400→408pxの一箇所。全5契約verified。320/399/400/407pxは1列、408/960pxは2列。通常・SSRともJS 0チャンク・0B、HTML 1090B。手動CLI4回（help1、layout3）、build2回、受入grader1回。初回診断全文はfirst-failure.txt、全実行と編集根拠はlog.jsonlに保存。

requiresは親が子へ渡す割当領域の条件、ensures省略時は両軸fit。Tileが180×100pxを要求し、Boardは配布rootとして320–960×640–960pxを受ける。診断の「checked contracts: Board at Board, Tile at Board/0」は検査中の契約の列挙で、Board自身が180pxを要求する意味ではない。不足する実体は4枚の.tileで、400px時の割当は176px。CSS最小幅を守っても親トラックからあふれる。

有用な原文は「width [400, 408)px; height [640, 960]px」。これと「requires 180px but receives 178px」、padding/gapから2×180+16+32=408pxと推論でき、安全な二列境界を選べた。契約、最小寸法、余白、枚数、native root、配布域は保持。

摩擦はsummaryの場所がtile要素で、原因の親grid/media行を指さないこと。JSONは8490行で追いにくく、build診断は同じ違反を4回繰り返す。改善要求は①要求元契約→割当grid→mediaの位置を結ぶ、②必要な境界を寸法内訳付きで示す、③buildも重複をまとめsummaryと同じ契約・instance表示にする。保証は閉じたCSSと信頼済み内容寸法のモデル内で、ブラウザー丸め等は対象外と理解した。
