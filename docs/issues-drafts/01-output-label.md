# EVAL-01: output の標準ラベルが拒否される

> outputへlabelを結ぶと`E_A11Y_REFERENCE`で拒否され、spanとaria-labelへ変更した。

出典: author-v1 `report.md`。`<label for="total">Total reviews</label><output id="total">3</output>` が再現例。

原因: labelable 要素の検査が input / textarea / select に限定されていた。
[HTML Standard](https://html.spec.whatwg.org/multipage/forms.html#category-label) に従い、現在受理する HTML 要素の button / output も判定へ追加した。explicit / wrapping label で同じ判定を使う。hidden input と複数 control の wrapping label は引き続き拒否する。meter / progress / custom elements の追加はこの修正の範囲外。

状態: 修正済み。`tests/forms.test.mjs` の回帰テストで Red → Green を確認。
