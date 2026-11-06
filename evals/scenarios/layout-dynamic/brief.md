# 動的構造と native scrollbar の記述・読解

[実行例](../../../examples/responsive-dynamic/)を使い、npm の Vite API を前提に次を試す。

1. `Show` の非表示側と、class のもう一方を重くする。現在の SSR が正常でもビルドで拒否されることを説明する。
2. guarded append の上限を4から5へ変え、レポートの件数上界を確認する。上限ガードを外し、設定の maxItems で免除できないことを確認する。
3. overlay 0px / classic15px の両 profile を宣言する。min-width100pxの子に115pxが必要となる理由を説明する。profile は全OSや0〜15pxの連続範囲を意味しない。
4. stableをautoに変えて、表示/非表示の組み合わせを読む。both-edges と横 scrollbar の高さを区別する。
5. 入力により変わる任意 class、無制限のループ、未宣言のthin寸法、body伝播を試し、unknown の診断を読む。

合格条件: 初期SSRと全候補の違い、ガードからの件数上界、内容/fontとnative metricの信頼する契約、解析上限と未証明の範囲を説明できる。実装回帰とbrowser oracleは自動化済み。独立した利用者の読み書き評価は今後この課題で行う。
