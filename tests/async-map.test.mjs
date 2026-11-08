import test from 'node:test';
import assert from 'node:assert/strict';
import {createMapSession,project,unproject,zoomAt,validatePlaces} from '../examples/async-map/model.mjs';

const place=(id,x=1000,y=700)=>({id,name:id,category:'cafe',x,y,rating:4.5,address:'1 Local Street',description:'Local fixture'});
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
function harness(){
  const searches=[],details=[],changes=[];
  const session=createMapSession({search:(request,signal)=>{const task=deferred();searches.push({...task,request,signal});return task.promise;},
    details:(id,signal)=>{const task=deferred();details.push({...task,id,signal});return task.promise;},onChange:state=>changes.push(state)});
  return {session,searches,details,changes};
}

test('map projection round trips and pointer-anchored zoom preserves the world point',()=>{
  for(const width of [320,880])for(const height of [320,640])for(const scale of [0.75,1,2,4]) {
    const view={x:1024,y:768,scale,width,height},world={x:950,y:810},screen=project(world,view);
    const result=unproject(screen,view);assert.ok(Math.abs(result.x-world.x)<1e-9);assert.ok(Math.abs(result.y-world.y)<1e-9);
    const next=zoomAt(view,1.25,screen),anchored=unproject(screen,next);
    assert.ok(Math.abs(anchored.x-world.x)<1e-9);assert.ok(Math.abs(anchored.y-world.y)<1e-9);
  }
});

test('latest search wins even if the transport ignores abort and completes out of order',async()=>{
  const {session,searches}=harness();
  const older=session.search('old','all'),newer=session.search('new','park');
  assert.equal(searches[0].signal.aborted,true);
  searches[1].resolve([place('new')]);await newer;
  searches[0].resolve([place('old')]);await older;
  assert.deepEqual(session.state.places.map(p=>p.id),['new']);assert.equal(session.state.query,'new');
  assert.equal(session.state.phase,'ready');assert.equal(session.state.stats.stale,1);
});

test('loading observations include the request that caused them',async()=>{
  const {session,searches}=harness(),pending=session.search('','all');
  assert.equal(session.state.phase,'loading');assert.equal(session.state.stats.issued,1);
  searches[0].resolve([]);await pending;
});

test('search errors keep previous results and a retry can publish again',async()=>{
  const {session,searches}=harness();
  let pending=session.search('','all');searches[0].resolve([place('first')]);await pending;
  pending=session.search('new','all');searches[1].reject(new Error('network failed'));await pending;
  assert.equal(session.state.phase,'error');assert.equal(session.state.places[0].id,'first');
  pending=session.refresh();searches[2].resolve([place('recovered')]);await pending;
  assert.equal(session.state.phase,'ready');assert.equal(session.state.places[0].id,'recovered');
});

test('detail requests have an independent generation, cache, selection and saved places',async()=>{
  const {session,searches,details}=harness();
  let pending=session.search('','all');searches[0].resolve([place('a'),place('b')]);await pending;
  const a=session.select('a'),b=session.select('b');assert.equal(details[0].signal.aborted,true);
  details[1].resolve(place('b'));await b;details[0].resolve(place('a'));await a;
  assert.equal(session.state.detail.id,'b');session.toggleSaved('b');assert.equal(session.state.saved.includes('b'),true);
  assert.equal(session.state.view.x,1000);assert.equal(session.state.view.y,700);
  session.closeDetails();await session.select('b');assert.equal(details.length,2,'ready detail is reused');
  assert.equal(session.state.detail.id,'b');assert.equal(session.state.places.length,2);
});

test('unmount invalidates both channels before late success or error can publish',async()=>{
  const {session,searches,details,changes}=harness();
  const search=session.search('','all'),detail=session.select('a');
  session.dispose();const count=changes.length;
  assert.equal(searches[0].signal.aborted,true);assert.equal(details[0].signal.aborted,true);
  searches[0].resolve([place('late')]);details[0].reject(new Error('late failure'));await Promise.all([search,detail]);
  assert.equal(changes.length,count);assert.equal(session.state.disposed,true);assert.deepEqual(session.state.places,[]);
  assert.equal(session.state.phase,'disposed');
  await session.search('after','all');assert.equal(searches.length,1);assert.equal(session.dispose(),false);
});

test('closed map data rejects malformed coordinates and duplicate identity',()=>{
  assert.deepEqual(validatePlaces([place('ok')]),[place('ok')]);
  for(const values of [[place('a'),place('a')],[{...place('x'),x:Infinity}],[{...place('x'),category:'unknown'}],[{...place('x'),name:42}],{},[null]])
    assert.throws(()=>validatePlaces(values));
  assert.throws(()=>validatePlaces(new Array(1)));
  let reads=0;const accessor=[];Object.defineProperty(accessor,'0',{enumerable:true,get(){reads++;return place('a');}});
  assert.throws(()=>validatePlaces(accessor));assert.equal(reads,0);
});

test('independent map sessions never share selection or cancellation',async()=>{
  const a=harness(),b=harness(),pa=a.session.search('a','all'),pb=b.session.search('b','all');
  a.session.dispose();assert.equal(b.searches[0].signal.aborted,false);
  a.searches[0].resolve([place('a')]);b.searches[0].resolve([place('b')]);await Promise.all([pa,pb]);
  assert.equal(b.session.state.places[0].id,'b');assert.equal(b.session.state.disposed,false);
});

test('bounded completion schedules preserve latest-only publication across disposal',async()=>{
  const permutations=[[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]];
  for(const order of permutations)for(let closeAt=0;closeAt<=3;closeAt++) {
    const {session,searches,changes}=harness(),jobs=[0,1,2].map(i=>session.search(String(i),'all'));
    for(let step=0;step<3;step++) {
      if(step===closeAt)session.dispose();
      searches[order[step]].resolve([place(String(order[step]))]);await jobs[order[step]];
      assert.ok(changes.filter(s=>s.phase==='ready').every(s=>s.places[0].id==='2'));
    }
    if(closeAt===3)session.dispose();
    await Promise.all(jobs);assert.equal(session.state.disposed,true);
  }
});
