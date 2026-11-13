# リジェクト例の実行結果

各例は独立した入力。対応版は一般的な意味保存変換を保証しない。

|結果|例|拒否版|実際の診断|対応版|
|---|---|---|---|---|
|PASS|[float](float/reject/app.css)|violated|[E_LAYOUT_FLOAT](float/reject/report.json)|[verified](float/accept/app.css)|
|PASS|[flex](flex/reject/app.css)|unknown|[U_LAYOUT_FLEX](flex/reject/report.json)|[verified](flex/accept/app.css)|
|PASS|[content-box](content-box/reject/app.css)|violated|[E_LAYOUT_ITEM_SIZE](content-box/reject/report.json)|[verified](content-box/accept/app.css)|
|PASS|[block-height](block-height/reject/app.css)|violated|[E_LAYOUT_CONTENT](block-height/reject/report.json)|[verified](block-height/accept/app.css)|
|PASS|[wrapping](wrapping/reject/app.css)|violated|[E_LAYOUT_WRAP](wrapping/reject/report.json)|[verified](wrapping/accept/app.css)|
|PASS|[container-breakpoint](container-breakpoint/reject/app.css)|violated|[E_LAYOUT_CONTENT](container-breakpoint/reject/report.json)|[verified](container-breakpoint/accept/app.css)|
|PASS|[intrinsic-fr](intrinsic-fr/reject/app.css)|unknown|[U_LAYOUT_GEOMETRY](intrinsic-fr/reject/report.json)|[verified](intrinsic-fr/accept/app.css)|
|PASS|[css-variable](css-variable/reject/app.css)|unknown|[U_LAYOUT_VARIABLE](css-variable/reject/report.json)|[verified](css-variable/accept/app.css)|
|PASS|[inherit-boundary](inherit-boundary/reject/app.css)|unknown|[U_LAYOUT_GEOMETRY](inherit-boundary/reject/report.json)|[verified](inherit-boundary/accept/app.css)|
|PASS|[generated-content](generated-content/reject/app.css)|unknown|[U_LAYOUT_CSS](generated-content/reject/report.json)|[verified](generated-content/accept/app.css)|
|PASS|[nested-layer](nested-layer/reject/app.css)|unknown|[U_LAYOUT_LAYER](nested-layer/reject/report.json)|[verified](nested-layer/accept/app.css)|
|PASS|[revert-layer](revert-layer/reject/app.css)|unknown|[U_LAYOUT_CSS](revert-layer/reject/report.json)|[verified](revert-layer/accept/app.css)|
|PASS|[missing-auto-height](missing-auto-height/reject/app.css)|unknown|[U_LAYOUT_GEOMETRY](missing-auto-height/reject/report.json)|[verified](missing-auto-height/accept/app.css)|
|PASS|[percentage-height-cycle](percentage-height-cycle/reject/app.css)|unknown|[U_LAYOUT_GEOMETRY](percentage-height-cycle/reject/report.json)|[verified](percentage-height-cycle/accept/app.css)|

## float の禁止

Grid item の float を browser が無視する場合も、言語の禁止規則として検査する。

入力: [source](float/reject/app.isle)、[設定](float/reject/layout.json)。対応版: [source](float/accept/app.isle)、[設定](float/accept/layout.json)。

## flex のサブセット外の item

初期値の flex: 0 1 auto は内容サイズと縮小に依存する。row・nowrap で、固定(flex:none と px 幅)または伸縮(flex:1 1 0 と min-width:0)の item に書く。

入力: [source](flex/reject/app.isle)、[設定](flex/reject/layout.json)。対応版: [source](flex/accept/app.isle)、[設定](flex/accept/layout.json)。

## reset の上書きによる幅超過

content-box の幅100%に padding が32px追加され、割当を越える。

入力: [source](content-box/reject/app.isle)、[設定](content-box/reject/layout.json)。対応版: [source](content-box/accept/app.isle)、[設定](content-box/accept/layout.json)。

## 必要高さを満たさない row

宣言した必要高さ200pxに対し、row が100pxしか提供しない。

入力: [source](block-height/reject/app.isle)、[設定](block-height/reject/layout.json)。対応版: [source](block-height/accept/app.isle)、[設定](block-height/accept/layout.json)。

## 折り返し契約との矛盾

wrap:anywhere の契約を保ち、CSS を一致させる。

入力: [source](wrapping/reject/app.isle)、[設定](wrapping/reject/layout.json)。対応版: [source](wrapping/accept/app.isle)、[設定](wrapping/accept/layout.json)。

## 狭い区間だけ破綻する container query

200px + gap16px + 本文400pxが必要。viewport には padding32px も含まれる。

入力: [source](container-breakpoint/reject/app.isle)、[設定](container-breakpoint/reject/layout.json)。対応版: [source](container-breakpoint/accept/app.isle)、[設定](container-breakpoint/accept/layout.json)。

## 未対応の intrinsic minimum

対応版は minmax(0,1fr)。一般の1frと常に同じ意味だとは仮定しない。

入力: [source](intrinsic-fr/reject/app.isle)、[設定](intrinsic-fr/reject/layout.json)。対応版: [source](intrinsic-fr/accept/app.isle)、[設定](intrinsic-fr/accept/layout.json)。

## 値域不明の CSS variable

未解決の継承元を推測しない。対応版は値を明示する。有限に解決できる var() は解析可能。

入力: [source](css-variable/reject/app.isle)、[設定](css-variable/reject/layout.json)。対応版: [source](css-variable/accept/app.isle)、[設定](css-variable/accept/layout.json)。

## 継承元の情報不足

CSS を変えず、実在する html/body の祖先情報を補う。ShadowRoot へ存在しない祖先を入力しない。

入力: [source](inherit-boundary/reject/app.isle)、[設定](inherit-boundary/reject/layout.json)。対応版: [source](inherit-boundary/accept/app.isle)、[設定](inherit-boundary/accept/layout.json)。

## 生成 pseudo box の未対応

対応版は実 DOM の leaf として表す。配置や accessibility まで同値という主張ではない。

入力: [source](generated-content/reject/app.isle)、[設定](generated-content/reject/layout.json)。対応版: [source](generated-content/accept/app.isle)、[設定](generated-content/accept/layout.json)。

## nested layer の未対応

この小例を flat layer として書く。任意の layer 階層の平坦化ではない。

入力: [source](nested-layer/reject/app.isle)、[設定](nested-layer/reject/layout.json)。対応版: [source](nested-layer/accept/app.isle)、[設定](nested-layer/accept/layout.json)。

## layer rollback の未対応

この例の意図する値を明示する。revert-layer 一般の意味保存変換ではない。

入力: [source](revert-layer/reject/app.isle)、[設定](revert-layer/reject/layout.json)。対応版: [source](revert-layer/accept/app.isle)、[設定](revert-layer/accept/layout.json)。

## 自動高さの契約不足

対応版では呼出し側の責任で exact な intrinsicBlockSize を宣言する。

入力: [source](missing-auto-height/reject/app.isle)、[設定](missing-auto-height/reject/layout.json)。対応版: [source](missing-auto-height/accept/app.isle)、[設定](missing-auto-height/accept/layout.json)。

## percentage と自動高さの循環

対応版では親と row の definite な高さを与える。元の自動高さと同じ配置とは限らない。

入力: [source](percentage-height-cycle/reject/app.isle)、[設定](percentage-height-cycle/reject/layout.json)。対応版: [source](percentage-height-cycle/accept/app.isle)、[設定](percentage-height-cycle/accept/layout.json)。
