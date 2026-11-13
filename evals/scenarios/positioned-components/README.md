# Positioned component contracts

Run `just positioned-components-check` from the repository root. The source is
[positioned-components.isle](../../../examples/layout-contracts/positioned-components.isle).

The eight scenarios check private coordinate spaces, a stronger child size
requirement, private overflow, a wrong caller space, a missing child interface,
a private profile violation, public-root collisions and unsupported transforms.
The positive compiled HTML is measured at 320, 375, 641 and 960px. Layout
declarations are removed and recompiled to check identical HTML/CSS/modules.

Results: [report](../../results/positioned-components/report.json),
[integrity](../../results/positioned-components/integrity.json),
[phone](../../results/positioned-components/preview-375.png),
[desktop](../../results/positioned-components/preview-1280.png).

親のZ3 queryへ子のrequires・profile・privateな配置とcoverageを再帰的に含める。
子のinstance queryにも呼出し元のplacement transferを含める。160×120pxのCSS割当と
containing block寸法を別に保存し、要求を161pxへ変更しても不都合な入力を除外しない。

この評価は閉じたCSSと明示サイズの部分集合についての照合。周囲のfixture、任意の
browser丸め、hit testing、opaqueなSDKやscroll/transformは証明しない。

375px/1280pxの画像を目視した。左上のlegendと緑のswatch、右下の白いpanel、
panel内の青いprivate overlayが表示され、各枠の内側へ収まっている。見出しと説明の
文字に衝突・切れはない。図形は座標検証用で、実際の地図SDKや操作buttonではない。
