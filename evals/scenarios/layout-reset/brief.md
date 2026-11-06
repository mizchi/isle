# Reset と box-sizing の適用順を読む

[fixture.isle](fixture.isle)、[reset.css](reset.css)、[app.css](app.css)、[layout.json](layout.json)を読む。

1. box-sizing 自体が自然に継承される property か、reset が inherit を指定しているのかを区別する。
2. 同じ width:100% と padding の指定でも、content-box と border-box で何が変わるかを説明する。
3. html/body の ancestor 入力が必要な理由と、component の root と :root の違いを説明する。
4. :where の specificity、:is に一致しない ID がある場合の specificity、重要宣言での layer 順を説明する。
5. box-sizing:unset、未知の reset、生成内容を持つ ::before はどう扱われるか。
6. 解析へ reset を渡すことと、browser へ reset を配布することは同じ処理か。

回答は [期待する形式](../../expect/layout-reset-intent.json) の key で JSON にし、`node tools/eval.mjs layout-reset-intent answers.json` で採点する。書き手の課題は app layer で content-box へ戻して違反を再現し、どの宣言を直すと意図を保って収まるかを示すこと。`just layout-check` で browser の computed style と照合できる。独立した参加者評価は未実施。
