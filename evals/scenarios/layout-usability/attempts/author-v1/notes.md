# 初見consumerの読解と判断

- `requires` はviewportそのものだと思いかけたが、`docs/layout-contract-language.md` の「`requires` は親が提供する **割当領域** の条件です。CSS 宣言ではなく、viewport の範囲とも区別します。」で親からのallocationと理解した。rootは320–960×640–960、子は160–960×96–960にした。
- `ensures` を置けばCSSの不足を補うのではなく、同文書の「`G` は実装モデルへの仮定に追加せず、`R AND A AND M AND NOT G` で反例を探します。」から検査したいfitの義務と理解した。
- 「auto row 等で割当高さが definite でなければ allocated.block はありません。その地点へ両軸の子契約を接続すると Unknown です。」に従い、子へ96pxの明示行を割り当てた。
- `docs/composition.md` の「無指定の component は props・純粋な derive・HTML の範囲に制約します。」と、`docs/control-components.md` の「独立 client owner、RenderFragment の投影、schema Form、textarea / select / option は反復・分岐を持つ owner では未対応です。」から、callbackを子へ渡す書き方がわからなかった。子にnative Toggleを置き、親rowでbubbleするclickを受ける構成にした。結果としてカード全体がtoggle対象になる。要件のボタン操作は満たすが、希望した接続範囲より広い。
- `isle --help` は終了コード2でusageを出す。usageは `node tools/isle.mjs` と書かれ、npm利用者向けの呼出し方が表示されない。最初の失敗出力として `first-failure.txt` へ保存した。最初のコンパイル失敗は `first-compile-failure.txt` に別途保存した。
- 可視ラベルを付けたくなり `<label for="total"><output id="total">` の関係を作ると `E_A11Y_REFERENCE: Label target is not a labelable control` になった。hintは `Reference a visible input, textarea or select.` と具体的だが、outputにラベルを付ける代替例はない。spanとaria-labelへ戻す。
- `visible-label-browser` は直前のbuild失敗後の古いdistを検査してしまった。この成功は新ソースの結果として使わず、修正後にbuild・browserをやり直す。
- 本番buildの出力は最初 `dist/isle.layout.json 2,462.07 kB`、visible label追加後は `2,966.50 kB` と成功の終了コードだった。verified宣言や検査case数の短い要約がなく、成功範囲の確認には約3MBのJSONを読む必要がある。
- READMEの3ファイル例は入りやすい。layout guideはCLI例が `node tools/isle.mjs` とcheckout形式で、prototype guideは「MoonBit が必要」と書き、READMEの「利用者に不要」と食い違う。今回MoonBitは実行せず、配布物だけでbuildできた。
- フレームワーク実装、禁止ディレクトリ、インストール済みパッケージ実装は読まず、公開docsと通常のCLI/APIのみを使用した。
- 独立graderはround1でpass。source / production-build / browser-layout / resume-interactions / ssr-buildをすべて通過。layout verified、宣言instance5、resume JS 11933bytes（gzip5566bytes）、SSR JS0。成功後はアプリを変更していない。
