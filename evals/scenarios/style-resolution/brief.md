# CSS の取得・適用と owner を読む

[app.isle](../../../e2e/fixtures/style-loading/app.isle)、[resource module](../../../e2e/fixtures/style-loading/a.mjs)、[CSS](../../../e2e/fixtures/style-loading/a.css)、[設定](../../../e2e/fixtures/style-loading/vite.config.mjs)を読む。`just style-check` で正常・遅延・失敗・破棄・eager と複数 root を実行できる。読解 grader と参加者評価は未実施。

1. CSS の先読み、stylesheet の準備、適用、module 評価、setup、state / DOM commit の順序を説明する。
2. CSS の応答中に dispose / DOM 削除 / 別 ShadowRoot へ移動した場合、何が適用されるか。
3. CSS 読み込み失敗後の再操作では、コードの再評価と setup はどうなるか。
4. B を先に操作してから A を操作したとき、cascade 順序はどう決まるか。同じ A を二つ操作すると stylesheet は何枚になるか。
5. CSS を初期 SSR から表示したい場合、resource module の import だけでよいか。
6. 同一 CSS の二つの widget は、取得・適用・破棄のどこまで共有するか。host の URL を変えても正しい CSS を取得できる理由は何か。
7. auto の gzip 予算と cold code budget に CSS が含まれるか。CSSOM 全体や layout 時間も形式的に保証されるか。

書き手の追加課題は、三つ目の component に CSS を追加し、操作順を逆にしても定義した cascade 順序を保ち、CSS 応答前に unmount しても module 評価・setup を実行しないことを確認する。未使用 selector の除去や専用 CSS DSL の実装を、この課題の既存機能として仮定しない。
