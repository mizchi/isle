# Container query と縦方向の契約を読む

[fixture.isle](fixture.isle)、[CSS](layout.css)、[契約](layout.json) を読む。

1. Shell が query する content 幅と viewport 幅の差を求める。条件を616pxから600pxへ変えると、どの viewport 区間で幅が不足するか。
2. 一列・二列の場合に、それぞれ最低何pxの viewport 高さが必要か。padding・row-gap・固定行を数える。
3. container query が自分自身を選ぶか、名前の大文字・小文字を区別するかを説明する。
4. Shell と対象の間へ inline-size container を置いた場合、無名の height query がどこを選ぶか。
5. intrinsicBlockSize は font metrics から自動証明された値か。width profile が定義域を覆わない場合はどうなるか。
6. 反例の幅・高さの外接区間だけで、条件の相関を失わず表現できるか。region の vertices と strict constraints の役割を説明する。

回答は [期待する形式](../../expect/layout-axes-intent.json) の key で JSON にし、`node tools/eval.mjs layout-axes-intent answers.json` で採点する。独立した参加者評価は未実施。

書き手の課題は、200pxの本文を240pxへ変更し、必要な幅・高さと breakpoint を再計算して verified にすること。CSS の切り取りや検査対象外への変更で診断を隠さず、`just layout-check` の browser 測定で反例と修正を照合する。
