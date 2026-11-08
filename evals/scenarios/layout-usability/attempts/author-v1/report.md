独立graderは1/4 roundで成功。source・本番build・browser layout・resume全7操作・SSR buildを通過した。

`requires`をviewportと混同しかけたが、「親が提供する割当領域」の説明で理解した。`ensures`はCSSを補う宣言ではなくfitを検査する義務。親320–960×640–960、子160–960×96–960を宣言し、96pxの明示行で高さを渡した。宣言だけで検査が有効になり、SSRはJS/Wasm 0、全7操作、4件上限、599/600pxの列切替、Toggle後のroot保持を確認した。

`check`の診断コード・offset・hintは修正に使えた。ただしoutputへlabelを結ぶと`E_A11Y_REFERENCE`で拒否され、spanとaria-labelへ変更した。pure子へ親イベントを渡す記法が見つからず親rowでclickを受けた結果、見出しクリックもtoggleする。`--help`はexit2でcheckout内の実行形式を表示する。約3MBの証明書に対しbuild出力にはverifiedの短い要約がない。

改善要望は3点。①outputのlabel対応と例。②pure子のボタンへ親イベントを限定接続する公開例。③npm利用者向けCLI表記・行付き診断・短い検証要約。
