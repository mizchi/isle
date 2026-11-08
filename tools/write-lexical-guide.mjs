// Keep the npm consumer guide executable by deriving its four files from the demo.
import {readFile,writeFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');
let document='# 親所有イベントと SafeGrid の完結例\n\n親が配列・filter・eventを所有し、universalな子へボタンをchildrenとして投影します。見出し・余白にはhandlerを付けません。\n\n[導入手順](getting-started.md)に従い、配布されたpreview tgzとVite 8.3.5以上をアプリへ追加します。Node.js 24+ とpnpmを使い、MoonBitの導入は不要です。以下の4ファイルを同じディレクトリへ置きます。\n\nrecord配列のstateは、schemaと `state reviews: Review[]` の注釈が必要です。投影するbuttonのCSSとresetは呼び出し元の親へ記述します。内容寸法は信頼する十分な境界としてViteのboxesへ渡します。\n\n';
for(const [file,language] of [['app.isle','text'],['vite.config.mjs','js'],['index.html','html'],['reset.css','css']]) {
  let source=await read(`examples/lexical-events/${file}`);
  if(file==='vite.config.mjs') source=source.replace("from '../../lib/vite.mjs'","from '@isle/prototype/vite'")
    .replace("'../../dist/lexical-events-ssr'","'dist-ssr'").replace("'../../dist/lexical-events'","'dist'");
  document+=`## ${file}\n\n\x60\x60\x60${language}\n${source.trimEnd()}\n\x60\x60\x60\n\n`;
}
document+='## 実行と検査\n\n```sh\npnpm exec vite\npnpm exec vite build\npnpm exec vite build --mode ssr\n```\n\n開発サーバーは <http://127.0.0.1:4341/>。通常buildはlayoutを検査してresume用chunkを生成し、SSR buildはHTML/CSSだけを生成します。全7操作と見出し・余白の不活性、4幅での列数、root保持、SSR JS 0は[回帰シナリオ](../evals/scenarios/lexical-events/README.md)で検査しています。\n\n`requires`は親から受ける割当、`ensures`は対応するCSS部分集合と信頼する内容寸法の下で検査する義務です。親子の契約の区別と保証範囲は[レイアウト契約](layout-contract-language.md)を参照してください。別のclient ownerへ可変なfragmentや親イベントを渡すことはできません。\n';
const destination=new URL('docs/lexical-review.md',root);
if(process.argv.includes('--check')) {
  if(await readFile(destination,'utf8')!==document) throw new Error('Regenerate docs/lexical-review.md with node tools/write-lexical-guide.mjs');
} else await writeFile(destination,document);
