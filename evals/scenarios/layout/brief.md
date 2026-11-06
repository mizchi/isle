# Grid の親子契約と media 条件を読む

[fixture.isle](fixture.isle)、[layout.css](layout.css)、[layout.json](layout.json) を読む。

1. 二列へ切り替える最小 viewport 幅が608pxである理由を、padding・gap・sidebar・本文の必要幅から説明する。
2. breakpoint を600pxへ変更したとき、破綻する幅の区間と、親から子へ割り当てられる幅を求める。
3. overflow: hidden を追加するだけで fit 契約が成立するか。明示 clip / scroll 契約との違いを説明する。
4. minInlineSize がフォント・入力全般から自動推論された証明か、それとも呼出し側の仮定かを説明する。
5. 未知の selector、外部 CSS、動的構造、未対応の style query があると、検査はどの結果を返すか。

書き手の課題は、本文の必要幅を増やし、breakpoint と契約を更新して、全宣言区間で verified にすること。CLI の反例を実ブラウザの割当幅と照合する。CSS を切り取ってエラーを隠さない。

回答は [期待する形式](../../expect/layout-intent.json) の key で JSON にし、`node tools/eval.mjs layout-intent answers.json` で採点する。期待値を読まない参加者評価は未実施。受入検査は `just layout-check`。
