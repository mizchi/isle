# Inline CSS と Z3 の読解・記述評価

[例](../../../examples/inline-css/app.isle) と [仕様](../../../models/css_layout/contract.smt2) を読む。

1. 4つの min-width:40px を1行に置くとき、幅159px、160px、161pxの結果を予測する。
2. media の切り替えを160pxから159pxにすると、どこで壊れるか。
3. 高さ40pxの箱が2行になり、viewport height が79pxのときの結果を説明する。
4. Z3 が UNSAT でも、CSS に未対応の var() が残ると Verified にしない理由を説明する。
5. child component の同じ class 名へ親の CSS が漏れるか、For の追加行に CSS が必要かを説明する。
6. Wasm がアプリの配布物に含まれるか、どの画面・操作で読み込むかを説明する。

記述課題：幅160px未満で2列へ切り替え、幅80pxからの証明を通す。次に padding / gap を加え、必要な境界値へ直す。数値だけを変更せず、box-sizing と親子の割り当てを説明できるか記録する。

自動検査は Node・Z3・Vite・Chromium による受入検査。書きやすさ・意図を読めるかの参加者評価と自動読解 grader は未実施。
