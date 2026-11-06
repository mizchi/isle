# 拒否と解析不足を読み分ける

[cases.mjs](cases.mjs)を読み、`just layout-rejections` で各例を実行する。生成される CSS・設定・diagnostics の両側を見比べる。

1. float が violated、通常の1frがunknownになる理由を説明する。
2. CSSを変更せずに追加情報で検査を通せる例を選び、存在しないancestorを入力してよいか説明する。
3. 対応版が一般的な意味保存変換ではない例を挙げる。
4. viewportの検査範囲を狭めることと、レイアウトを直すことを区別する。
5. sourceが構文エラーでコンパイルできなければ、期待したレイアウト拒否を再現したと数えてよいか。

回答は [期待する形式](../../expect/layout-rejections-intent.json)の key でJSONにし、`node tools/eval.mjs layout-rejections-intent answers.json` で採点する。独立した参加者評価は未実施。

書き手の課題は、content-box例の余白を増やし、宣言したviewport範囲を保ったまま対応版をverifiedにすること。元の診断codeだけを変更して回帰テストを通さない。
