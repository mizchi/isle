import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {compile,requireIR} from '../lib/compiler.mjs';
import {prepareProgram} from '../lib/codegen.mjs';

const bytes=value=>Buffer.byteLength(value);
const visible=html=>html.replace(/ data-isle-[a-z-]+="[^"]*"/g,'').replace(/<!--[\s\S]*?-->/g,'');
export async function evaluateSemanticOptimizer() {
  const source=await readFile(new URL('../examples/semantic-optimizer/app.isle',import.meta.url),'utf8');
  const input=requireIR(compile(source)),conservative=structuredClone(input);
  // This models opaque external observers, without attaching a resource or changing the UI.
  // It disables the three compile-only passes; it is not an older release or another framework.
  conservative.components.forEach(component=>{component.optimizationBarrier='resource-setup';});
  const programs=[prepareProgram(conservative),prepareProgram(input)],rows=[];
  for(const name of ['Details','Idle']) {
    const props=name==='Details'?{summary:'s'.repeat(65536),user:{name:'Ada',biography:'b'.repeat(65536)}}:{};
    const observations=programs.map(program=>{
      const definition=program.get(name),generated=definition.generate(),rendered=definition.render(props);
      return {html:rendered.html,snapshotJsonBytes:rendered.snapshot?bytes(JSON.stringify(rendered.snapshot)):0,
        generatedModuleBytes:generated.handlers.reduce((sum,handler)=>sum+bytes(handler.code),0)+(generated.handlers.length&&generated.regions?bytes(generated.regions.code):0),
        snapshotFields:generated.fields.map(field=>field.name),entries:generated.handlers.map(handler=>handler.id),
        factories:generated.regions?(generated.regions.code.match(/function\(v,l,id,scope\)/g)??[]).length:0};
    });
    const [before,after]=observations;
    if(visible(before.html)!==visible(after.html)) throw new Error(`${name}: initial visible HTML changed`);
    rows.push({component:name,sameInitialHTML:true,before:{...before,html:undefined},after:{...after,html:undefined}});
  }
  return {version:1,baseline:'same checked program with opaque-observer barrier; not an older release or Qwik',
    units:'UTF-8 bytes; generated JS before bundling, excludes shared runtime; not transfer sizes or timings',rows};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) process.stdout.write(JSON.stringify(await evaluateSemanticOptimizer(),null,2)+'\n');
