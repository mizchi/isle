import test from 'node:test';
import assert from 'node:assert/strict';
import {createDependencies,planValuePhases} from '../lib/resume-plan.mjs';
import {compile,requireIR} from '../lib/compiler.mjs';
import {prepareProgram} from '../lib/codegen.mjs';

const prepared=source=>prepareProgram(requireIR(compile(source))).get('C');
const names=fields=>fields.map(field=>field.name);

test('shared dependencies expand derives and preserve lexical shadowing',()=>{
  const dependencies=createDependencies(new Map([
    ['double',{kind:'binary',op:'*',left:{kind:'name',name:'n'},right:{kind:'number',value:2}}],
    ['label',{kind:'name',name:'double'}],
  ]));
  assert.deepEqual([...dependencies({kind:'name',name:'label'})],['n']);
  assert.deepEqual([...dependencies({kind:'name',name:'label'},new Map([['label',0]]))],['$local']);
  assert.deepEqual([...dependencies({kind:'name',name:'double'},new Map([['n',0]]))],['n'],'a component derive retains its declaration scope');
  const cycle=createDependencies(new Map([['a',{kind:'name',name:'b'}],['b',{kind:'name',name:'a'}]]));
  assert.throws(()=>cycle({kind:'name',name:'a'}),/Cyclic derive/);
});

test('phase plan closes initializer dependencies without serializing initialization-only inputs',()=>{
  const component={name:'C',props:[{name:'seed',type:'number'},{name:'label',type:'string'},{name:'unused',type:'string'}],
    states:[{name:'a',type:'number',initial:{kind:'name',name:'seed'}},{name:'b',type:'number',initial:{kind:'name',name:'a'}},{name:'dead',type:'number',initial:{kind:'number',value:0}}]};
  const plan=planValuePhases(component,{dependencies:createDependencies(new Map()),renderReads:new Set(['label']),resumeReads:new Set(['b'])});
  assert.deepEqual(names(plan.fields),['b']);
  assert.deepEqual(names(plan.states),['a','b']);
  assert.deepEqual(plan.htmlStates,[]);
  assert.deepEqual(Object.fromEntries(plan.values.map(v=>[v.name,v.phase])),{seed:'server',label:'server',unused:'unused',a:'server',b:'resume',dead:'unused'});
  assert.ok(plan.values.every(v=>v.owner==='C'));
});

test('phase projection preserves observable values for every three-state initialization DAG and read set',()=>{
  const names=['seed','a','b','c'],dependencies=createDependencies(new Map());
  const selected=mask=>new Set(names.filter((_,index)=>mask&(1<<index)));
  const check=(graph,plan,roots,initializers)=>{
    const env={seed:3};
    for(const state of initializers) env[state.name]=graph.get(state.name).reduce((sum,name)=>sum+env[name],1);
    for(const name of roots) assert.equal(env[name],plan[name]);
  };
  for(let graphMask=0;graphMask<64;graphMask++) {
    let edge=0;
    const graph=new Map(),states=names.slice(1).map((name,index)=>{
      const reads=names.slice(0,index+1).filter(()=>graphMask&(1<<edge++));graph.set(name,reads);
      const initial=reads.reduce((left,name)=>({kind:'binary',op:'+',left,right:{kind:'name',name}}),{kind:'number',value:1});
      return {name,type:'number',initial};
    });
    const component={name:'C',props:[{name:'seed',type:'number'}],states},reference={seed:3};
    for(const state of states) reference[state.name]=graph.get(state.name).reduce((sum,name)=>sum+reference[name],1);
    for(let renderMask=0;renderMask<16;renderMask++) for(let resumeMask=0;resumeMask<16;resumeMask++) {
      const renderReads=selected(renderMask),resumeReads=selected(resumeMask),plan=planValuePhases(component,{dependencies,renderReads,resumeReads});
      assert.deepEqual(new Set(plan.fields.map(field=>field.name)),resumeReads);
      check(graph,reference,new Set([...renderReads,...resumeReads]),plan.states);
      check(graph,reference,renderReads,plan.htmlStates);
    }
    if(graphMask===63) assert.throws(()=>check(graph,reference,new Set(['c']),states.slice(1)),assert.AssertionError,'missing an initializer must break the oracle');
  }
});

test('flat and region backends share phase contracts; server-only headings and seeds never enter snapshots',()=>{
  for(const branch of ['', '<Show when={open}><p>{panel}</p></Show>']) {
    const definition=prepared(`client component C(seed:number,title:string,panel:string,unused:string){
      state n=seed;state open=false;
      event add(e:EventSnapshot<MouseEvent>){n+=1;}
      event toggle(e:EventSnapshot<MouseEvent>){open=!open;}
      <main><h1>{title}</h1><button on:click={add}>{n}</button><button on:click={toggle}>Toggle</button>${branch}</main>}`);
    const generated=definition.generate(),fields=names(generated.fields);
    assert.deepEqual(fields,branch?['panel','n','open']:['n','open']);
    const props={seed:7,title:'Server heading',panel:'Future panel',unused:'x'.repeat(65536)},large=definition.render(props),small=definition.render({...props,unused:''});
    assert.equal(large.snapshotHtml,small.snapshotHtml);
    assert.deepEqual(large.snapshot[3],branch?['Future panel',7,false]:[7,false]);
    assert.match(large.html,/Server heading/);assert.doesNotMatch(large.html,/Future panel/);
    const phases=Object.fromEntries(generated.analysis.valuePhases.map(value=>[value.name,value.phase]));
    assert.equal(phases.seed,'server');assert.equal(phases.title,'server');assert.equal(phases.unused,'unused');
    assert.throws(()=>definition.render({...props,unused:42}),/prop/i);
  }
});

test('future row factories retain keys and render inputs without retaining unused props',()=>{
  const definition=prepared(`schema Item{id:string;title:string;}
    client component C(seed:Item[],salt:string,suffix:string,unused:string){state items:Item[]=seed;
      event clear(e:EventSnapshot<MouseEvent>){items=[];}
      <main><button on:click={clear}>Clear</button><For each={items}>{(item)=><Fragment key={item.id}><p>{item.title+suffix}</p></Fragment>}</For></main>}`);
  const generated=definition.generate();
  assert.deepEqual(names(generated.fields),['suffix','items']);
  const result=definition.render({seed:[],salt:'key-',suffix:'!',unused:'not the loop item'});
  assert.deepEqual(result.snapshot[3],['!',[]]);
  assert.doesNotMatch(generated.regions.code,/undefined/);
});

test('error fallback inputs survive and dead initializers are skipped without skipping input validation',()=>{
  const definition=prepared(`client component C(seed:number[],fallback:string){state items:number[]=seed;state dead=seed[100];
    event clear(e:EventSnapshot<MouseEvent>){items=[];}
    <main><button on:click={clear}>Clear</button><ErrorBoundary fallback={(error)=><p>{fallback}</p>}><p>{items[0]}</p></ErrorBoundary></main>}`);
  assert.deepEqual(names(definition.generate().fields),['fallback','items']);
  const result=definition.render({seed:[3],fallback:'Unavailable'});
  assert.deepEqual(result.snapshot[3],['Unavailable',[3]]);
  assert.match(definition.render({seed:[],fallback:'Unavailable'}).html,/Unavailable/);
  assert.deepEqual(definition.generate().analysis.skippedInitializers,['dead']);
  assert.throws(()=>definition.render({seed:'invalid',fallback:'Unavailable'}),/prop/i);
});

test('region contract hashes describe resume code, excluding server-only markup and initialization',()=>{
  const source=`client component C(seed:number){state n=seed;state open=false;
    event add(e:EventSnapshot<MouseEvent>){n+=1;}
    event toggle(e:EventSnapshot<MouseEvent>){open=!open;}
    <main><h1>Server heading</h1><button on:click={add}>{n}</button><button on:click={toggle}>Toggle</button><Show when={open}><p>{n}</p></Show></main>}`;
  const original=prepared(source).generate();
  for(const edited of [source.replace('Server heading','Other heading'),source.replace('state n=seed','state n=seed+1')]) {
    const changed=prepared(edited).generate();
    assert.equal(changed.regions.code,original.regions.code);
    assert.deepEqual(changed.handlers.map(h=>h.code),original.handlers.map(h=>h.code));
    assert.equal(changed.schemaId,original.schemaId);
  }
  assert.notEqual(prepared(source.replace('n+=1','n+=2')).generate().schemaId,original.schemaId);
  assert.notEqual(prepared(source.replace('<p>{n}</p>','<p>{n+1}</p>')).generate().schemaId,original.schemaId);
});
