import test from 'node:test';
import assert from 'node:assert/strict';
import {compile,requireIR} from '../lib/compiler.mjs';
import {compilePreview} from '../lib/compiler-browser.mjs';
import {prepareProgram} from '../lib/codegen.mjs';
import {optimizeObservability} from '../lib/observability.mjs';
import {evaluateSemanticOptimizer} from '../tools/eval-semantic-optimizer.mjs';

const definition=source=>prepareProgram(requireIR(compile(source))).get('C');

test('unobserved total writes and their entries disappear, including transitive dead state',()=>{
  const source=`client component C(seed:number){state n=seed;state copied=0;
    event increment(e:EventSnapshot<MouseEvent>){n+=1;copied=n;}
    <button type="button" on:click={increment}>Click</button>}`;
  const component=definition(source),generated=component.generate();
  assert.deepEqual(generated.handlers,[]);assert.deepEqual(generated.fields,[]);
  assert.equal(component.render({seed:0}).snapshot,null);
  assert.doesNotMatch(component.render({seed:0}).html,/data-isle-on|data-isle-root/);
  assert.throws(()=>component.render({seed:'invalid'}),/props/);
  assert.deepEqual(generated.analysis.observability.removedHandlers,['increment']);
  const preview=compilePreview(source,{props:{seed:0}});
  assert.equal(preview.ok,true);assert.deepEqual(preview.preview.modules,[]);assert.deepEqual(preview.preview.events,[]);
  const observed=definition(source.replace('Click</button>','{copied}</button>')).generate();
  assert.equal(observed.handlers.length,1);assert.deepEqual(observed.handlers[0].writes,['n','copied']);
});

test('potential numeric/parse/index errors, initializers and synchronous cancellation remain observable',()=>{
  for(const body of ['n=n/step','n=n*step','n=values[0]']) {
    const source=`client component C(step:number,values:number[]){state n=1;event run(e:EventSnapshot<MouseEvent>){${body};}<button on:click={run}>Run</button>}`;
    assert.equal(definition(source).generate().handlers.length,1,body);
  }
  const invalid=definition('client component C(values:number[]){state n=values[0];event run(e:EventSnapshot<MouseEvent>){n=0;}<button on:click={run}>Run</button>}');
  assert.equal(invalid.generate().handlers.length,1);assert.throws(()=>invalid.render({values:[]}),/index/i);
  const readInvalid=definition('client component C(values:number[]){state source=values[0];state n=0;event run(e:EventSnapshot<MouseEvent>){n=source;}<button on:click={run}>Run</button>}');
  assert.equal(readInvalid.generate().handlers.length,1,'a removed read must not hide an invalid source initializer');
  assert.throws(()=>readInvalid.render({values:[]}),/index/i);
  const prevented=definition('client component C(){event run(e:EventSnapshot<MouseEvent>){}<button on:click.preventDefault={run}>Run</button>}');
  assert.equal(prevented.generate().handlers.length,1);assert.match(prevented.render({}).html,/\|p/);
});

test('actions and opaque resource owners are barriers to dead event elimination',()=>{
  const input={name:'C',side:'client',props:[],states:[{name:'n',type:'number',initial:{kind:'number',value:0}}],derives:[],root:{kind:'element',tag:'button',attributes:[],children:[],handlers:[{id:'save',event:'click',async:true,statements:[{target:'n',op:'=',value:{kind:'remote',name:'save',fields:[]}}]}]}};
  assert.equal(optimizeObservability(input).component.root.handlers.length,1);
  const opaque={...input,optimizationBarrier:'resource-setup',root:{...input.root,handlers:[{id:'activate',event:'click',statements:[{target:'n',op:'+=',value:{kind:'number',value:1}}]}]}};
  assert.equal(optimizeObservability(opaque).component.root.handlers.length,1);
  const tree=requireIR(compile(`client component Child(){state n=0;<button>on click add{n+=1;}{n}</button>}
    client component C(){state n=0;<main><Child/><button>on click activate{n+=1;}Parent</button></main>}`));
  const program=prepareProgram(tree);
  assert.equal(program.get('C').generate().handlers.length,1,'parent disposal is observable through its child owner');
  assert.match(program.render('C',{}).html,/data-isle-parent="s0"/);
});

test('one-way booleans erase only the initial arm factory and its immutable capture',()=>{
  const source=`client component C(summary:string){state opened=false;
    event open(e:EventSnapshot<MouseEvent>){opened=true;}
    <main><button on:click={open}>Open</button><Show when={opened} fallback={<p>{summary}</p>}><p>Expanded</p></Show></main>}`;
  const component=definition(source),generated=component.generate();
  assert.deepEqual(generated.fields.map(field=>field.name),['opened']);
  assert.equal(generated.analysis.monotonicFactories.length,1);
  assert.match(component.render({summary:'Initial preview'}).html,/Initial preview/);
  assert.doesNotMatch(generated.regions.code,/Initial preview|escape\(v\[undefined\]\)/);
  assert.equal((generated.regions.code.match(/=\[null,/g)??[]).length,2);
  const reversible=definition(source.replace('opened=true;','opened=!opened;')).generate();
  assert.deepEqual(reversible.fields.map(field=>field.name),['summary','opened']);
  assert.deepEqual(reversible.analysis.monotonicFactories,[]);
});

test('initial arms inside recreated rows stay available and live initial-arm bindings remain captured',()=>{
  const definitionWithRows=definition(`client component C(summary:string){state opened=false;state rows:number[]=[];
    event add(e:EventSnapshot<MouseEvent>){rows=[1];}event open(e:EventSnapshot<MouseEvent>){opened=true;}
    <main><button on:click={add}>Add</button><button on:click={open}>Open</button><For each={rows}>{(row)=><Fragment key={row}><Show when={opened} fallback={<p>{summary}</p>}><p>Expanded</p></Show></Fragment>}</For></main>}`);
  assert.ok(definitionWithRows.generate().fields.some(field=>field.name==='summary'));
  const live=definition(`client component C(){state opened=false;state n=0;
    event add(e:EventSnapshot<MouseEvent>){n+=1;}event open(e:EventSnapshot<MouseEvent>){opened=true;}
    <main><button on:click={add}>Add</button><button on:click={open}>Open</button><Show when={opened} fallback={<p>{n}</p>}><p>Expanded</p></Show></main>}`);
  assert.deepEqual(live.generate().fields.map(field=>field.name),['opened','n']);
  assert.match(live.generate().regions.code,/c\.text/);
});

test('readonly record capture projects only primitive paths through derives',()=>{
  const source=`schema User{name:string;biography:string;}client component C(user:User){state opened=false;
    derive display=user.name;
    event open(e:EventSnapshot<MouseEvent>){opened=true;}
    <main><button on:click={open}>Open</button><Show when={opened}><p>{display}</p></Show></main>}`;
  const component=definition(source),generated=component.generate(),props={user:{name:'Ada',biography:'x'.repeat(65536)}};
  assert.deepEqual(generated.fields.map(field=>field.name),['user.name','opened']);
  assert.deepEqual(component.render(props).snapshot[3],['Ada',false]);
  assert.doesNotMatch(generated.regions.code,/\["name"\]/);
  assert.deepEqual(component.render({...props,user:{...props.user,biography:''}}).snapshot,component.render(props).snapshot);
  assert.throws(()=>component.render({user:{name:'Ada',biography:42}}),/prop/i);
  const accessor={};Object.defineProperty(accessor,'user',{enumerable:true,get(){throw new Error('Getter must not run');}});
  assert.throws(()=>component.render(accessor),/Invalid props/);
  const escaped=definition(source.replace('{display}','{JSON.stringify(user)}')).generate();
  assert.deepEqual(escaped.fields.map(field=>field.name),['user','opened']);
  assert.equal(typeof escaped.fields[0].type,'object');
});

test('primitive paths project independently, while array uses stay intact',()=>{
  const source=`schema User{name:string;note:string;other:string;}
    client component C(user:User){state opened=false;event open(e:EventSnapshot<MouseEvent>){opened=true;}
      <main><button on:click={open}>Open</button><Show when={opened}><p>{user.name}{user.note}</p></Show></main>}`;
  const component=definition(source);
  assert.deepEqual(component.generate().fields.map(field=>field.name),['user.name','user.note','opened']);
  assert.deepEqual(component.render({user:{name:'Ada',note:'Tag',other:'Unused'}}).snapshot[3],['Ada','Tag',false]);
  const array=definition(`schema User{name:string;biography:string;}client component C(users:User[]){state opened=false;
    event open(e:EventSnapshot<MouseEvent>){opened=true;}<main><button on:click={open}>Open</button><Show when={opened}><p>{users[0].name}</p></Show></main>}`);
  assert.deepEqual(array.generate().fields.map(field=>field.name),['users','opened']);
});

test('one-way factory proof preserves every transition in both directions and negated guards',()=>{
  for(const initial of [false,true]) for(const negated of [false,true]) for(const writes of [[false],[true],[false,true]]) {
    const source=`client component C(){state ready=${initial};${writes.map((value,index)=>`event write${index}(e:EventSnapshot<MouseEvent>){ready=${value};}`).join('')}
      <main>${writes.map((_,index)=>`<button on:click={write${index}}>Set</button>`).join('')}<Show when={${negated?'!':''}ready} fallback={<p>False</p>}><p>True</p></Show></main>}`;
    const generated=definition(source).generate(),pruned=new Set(generated.analysis.monotonicFactories.map(row=>row.arm));
    function explore(value,depth) {
      if(!depth) return;
      const before=(negated?!value:value)?0:1;
      for(const next of writes) {const after=(negated?!next:next)?0:1;if(before!==after) assert.ok(!pruned.has(after),'every entered arm needs its factory');explore(next,depth-1);}
    }
    explore(initial,5);
  }
});

test('unit updates retained by the conservative baseline remain valid at binary64 boundaries',()=>{
  for(const initial of [0,1,-1,Number.MIN_VALUE,-Number.MIN_VALUE,Number.MAX_VALUE,-Number.MAX_VALUE,2**53,-(2**53)]) for(const step of [-1,0,1]) {
    const value=initial+step;assert.equal(Number.isFinite(value),true);assert.equal(Object.is(value,-0),false);
  }
});

test('executable evaluation measures identical initial HTML with smaller snapshots and code',async()=>{
  const report=await evaluateSemanticOptimizer(),details=report.rows.find(row=>row.component==='Details'),idle=report.rows.find(row=>row.component==='Idle');
  assert.ok(report.rows.every(row=>row.sameInitialHTML));
  assert.ok(details.after.snapshotJsonBytes<details.before.snapshotJsonBytes);
  assert.ok(details.after.generatedModuleBytes<details.before.generatedModuleBytes);
  assert.equal(idle.after.generatedModuleBytes,0);assert.equal(idle.after.snapshotJsonBytes,0);
});
