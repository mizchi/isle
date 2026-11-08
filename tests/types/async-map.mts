import {createMapSession,type MapState, type Place} from '../../examples/async-map/model.mjs';
const session=createMapSession({search:async()=>[],details:async()=>({}),onChange(state:Readonly<MapState>){void state;}});
session.search('coffee','cafe');session.pan(10,20);
// @ts-expect-error Adapter categories are a closed contract.
session.search('coffee','anything');
// @ts-expect-error Published state is readonly.
session.state.query='mutated';
// @ts-expect-error Place coordinates must be finite numbers, not strings.
const invalid:Place={id:'a',name:'A',category:'cafe',x:'0',y:0,rating:4,address:'',description:''};
void invalid;
