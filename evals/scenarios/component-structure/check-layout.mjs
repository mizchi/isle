import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {compile} from '../../../lib/compiler.mjs';
import {analyzeLayout} from '../../../lib/layout.mjs';
import {declaredLayoutOptions} from '../../../lib/layout-declarations.mjs';
import {verifyDeclaredLayouts} from '../../../lib/layout-contract-node.mjs';

const document=await readFile(new URL('../../../docs/proposals/component-structure.md',import.meta.url),'utf8');
const proposed=[...document.matchAll(/```isle\n([\s\S]*?)\n```/g)].map(match=>match[1]).find(source=>source.startsWith('component FourCells()'));
assert.ok(proposed,'Missing FourCells proposal');
// The proposal grammar is NOT implemented. Check only the existing CSS/contract
// semantics after removing this known view wrapper, without changing its DOM.
const source=proposed.replace(/\n  view \{\n/,'\n').replace(/\n  \}\n\}$/,'\n}');
const gap=source.replace('display: grid;','display: grid; column-gap: 8px;');
const responsive=source.replace('160px..640px','80px..640px').replace('</style>','@media(width < 160px){.row{grid-template-columns:repeat(2,minmax(0,1fr));}}</style>');
const cases=[
 {name:'four-cells',source,layout:'verified',contract:'verified'},
 {name:'gap-missing-space',source:gap,layout:'violated',contract:'violated'},
 {name:'gap-corrected',source:gap.replace('160px..640px','184px..640px'),layout:'verified',contract:'verified'},
 {name:'responsive-corrected',source:responsive.replace('40px..640px','80px..640px'),layout:'verified',contract:'verified'},
 {name:'responsive-boundary-hole',source:responsive.replace('40px..640px','80px..640px').replace('width < 160px','width < 159px'),layout:'violated',contract:'violated'},
 {name:'responsive-missing-height',source:responsive,layout:'violated',contract:'violated'},
 {name:'missing-border-box-reset',source:source.replace('box-sizing: border-box;',''),layout:'verified',contract:'violated'},
 {name:'float',source:source.replace('display: grid;','display: grid; float: left;'),layout:'violated',contract:'unknown'},
 {name:'shorthand-interference',source:source.replace('.cell {','.cell { padding-left: 8px; padding: 0;'),error:'E_CSS_SHORTHAND_CONFLICT'},
];
const results=[];
for(const scenario of cases){
 const compiled=compile(scenario.source);
 if(scenario.error){assert.equal(compiled.ok,false,scenario.name);assert.ok(compiled.diagnostics.some(d=>d.code===scenario.error),scenario.name);results.push({name:scenario.name,stage:'compile',status:'rejected',codes:compiled.diagnostics.map(d=>d.code)});continue;}
 assert.equal(compiled.ok,true,JSON.stringify(compiled));
 const report=analyzeLayout(compiled.ir,declaredLayoutOptions(compiled.ir,{css:''})),contracts=await verifyDeclaredLayouts(report);
 assert.equal(report.status,scenario.layout,scenario.name);assert.equal(contracts.length,1);assert.equal(contracts[0].status,scenario.contract,scenario.name);
 results.push({name:scenario.name,layout:report.status,contract:contracts[0].status,...(contracts[0].proof?.witness?{witness:contracts[0].proof.witness}:{})});
}
const directory=new URL('../../results/component-structure/',import.meta.url);await mkdir(directory,{recursive:true});
const report={version:1,scope:'CSS and declared SafeGrid semantics only; proposal view wrapper removed manually; no compiler syntax implementation or full browser proof',passed:true,cases:results};
await writeFile(new URL('layout.json',directory),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
