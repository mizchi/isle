# 自動解決の取得・評価・実行を読む

[実行 fixture](../../../e2e/fixtures/auto-loading/app.isle)、[resource module](../../../e2e/fixtures/auto-loading/resources.mjs)、[Vite 設定](../../../e2e/fixtures/auto-loading/vite.config.mjs)を対象にする。`just loading-check` で生成物と browser の request / 評価 / setup を観測できる。読解の自動 grader と参加者評価は未実施。

1. 初期表示、input、clear、別 Counter の click について、取得・module 評価・snapshot 復元・setup がいつ起きるかを説明する。
2. 予算8192と0の結果を比較し、操作の意味が変わるかを説明する。
3. runtime / setup を複数 handler が共有するとき、追加 bytes はどう計上されるか。子 component の dynamic chunk も必要か。
4. サイズ不明・外部 import がある場合の判断と、明示 eager を指定した場合の違いを説明する。
5. 先読み後、操作前に close した場合、resource の取得と解放は起きるか。
6. API request の開始を早めるには、なぜ code の modulepreload とは別の契約が必要か。

書き手の追加課題は、同じ component に二つ目の click handler を加え、click 同士が共有 chunk を持ち、input 用の chunk へ混ざらないことを確認する。生成 manifest の resolution を読み、予算だけを変えて計画を比較する。速度の測定と、意味の正しさの検査は分けて記録する。
