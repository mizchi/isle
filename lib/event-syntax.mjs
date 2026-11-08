import {childrenOf, childGroups, references, rewrite, expressionChildren} from './template.mjs';

const events={click:'MouseEvent',dblclick:'MouseEvent',input:'InputEvent',change:'Event',submit:'SubmitEvent',invalid:'Event',keydown:'KeyboardEvent',focusout:'FocusEvent'};
const fields={value:'string',checked:'boolean',invalid:'boolean',validationMessage:'string',key:'string'};
const hint='Declare event name(e: EventSnapshot<MouseEvent>, args...) { ... } and bind on:click={name} or on:click={(e) => name(e, args...)}. See docs/events.md.';

// Tokenization is only for the signature and snapshot accesses. The existing
// typed expression frontend parses and checks every body and capture expression.
function tokens(source,start,end) {
  const result=[];
  for(let pos=start;pos<end;) {
    const match=/^(?:\s+|\/\/[^\n]*|\/\*[\s\S]*?\*\/)/.exec(source.slice(pos,end));
    if(match) {pos+=match[0].length;continue;}
    const at=pos,char=source[pos++];
    if('"\'`'.includes(char)) {while(pos<end) {const c=source[pos++];if(c==='\\') pos++;else if(c===char) break;}}
    else if(/[A-Za-z_]/.test(char)) {while(pos<end && /[A-Za-z_0-9]/.test(source[pos])) pos++;}
    else if(source.startsWith('=>',at) || source.startsWith('+=',at) || source.startsWith('-=',at)) pos++;
    result.push({value:source.slice(at,pos),start:at,end:pos});
  }
  return result;
}

export class EventDeclarations {
  constructor(parser,out,{name,side,props}) {
    Object.assign(this,{parser,out,name,side,props});
    this.declarations=new Map();this.bindings=new Map();this.stateRanges=[];this.helpers=new Set();
  }
  fail(code,message,span) {this.parser.error(code,message,span.start,span.end,hint);}
  fresh() {
    let name;do {name=`IsleEventProof${this.parser.serial++}`;} while(this.parser.source.includes(name));
    this.helpers.add(name);return name;
  }
  declaration() {
    const p=this.parser,start=p.pos;
    const async=/^async\b/.test(p.source.slice(p.pos));if(async) {p.name();p.trivia();}
    p.need('event','E_EVENT_SIGNATURE');const name=p.name('E_EVENT_SIGNATURE');
    if(this.side!=='client') this.fail('E_EVENT_SIDE','Event declarations require an explicit client component',{start,end:p.pos});
    if(this.declarations.has(name) || /^h\d+$/.test(name)) this.fail('E_EVENT_DUPLICATE',`Duplicate or reserved event name '${name}'`,{start,end:p.pos});
    p.trivia();if(!p.starts('(')) this.fail('E_EVENT_SIGNATURE','An explicit typed event parameter is required',{start,end:p.pos});
    const signature=p.group(),parts=tokens(p.source,signature.start,signature.end).map(t=>t.value).join(' ').split(',').map(s=>s.trim());
    const snapshot=/^([A-Za-z_]\w*)\s*:\s*EventSnapshot\s*<\s*(Event|MouseEvent|InputEvent|KeyboardEvent|SubmitEvent|FocusEvent)\s*>$/.exec(parts.shift() ?? '');
    if(!snapshot) this.fail('E_EVENT_SIGNATURE','The first parameter must be typed as EventSnapshot<EventType>',signature);
    const parameters=parts.map(part=>{
      const match=/^([A-Za-z_]\w*)\s*:\s*([A-Za-z_]\w*(?:\s*\[\s*\])*)$/.exec(part);
      if(!match) this.fail('E_EVENT_SIGNATURE','Capture parameters require a closed serializable value type',signature);
      return {name:match[1],type:match[2].replace(/\s/g,'')};
    });
    const names=[snapshot[1],...parameters.map(p=>p.name)];
    if(new Set(names).size!==names.length) this.fail('E_EVENT_SIGNATURE','Event parameters must have distinct names',signature);
    p.trivia();if(!p.starts('{')) this.fail('E_EVENT_SIGNATURE','An event body is required',{start,end:p.pos});
    const body=p.group(),declaration={name,async,parameters,snapshot:snapshot[1],eventType:snapshot[2],body,start,end:p.pos,uses:0,aliases:new Map()};
    this.declarations.set(name,declaration);
    declaration.proof=this.fresh();
    if(parameters.length) declaration.signature=this.fresh();
    return declaration;
  }
  resource() {
    const p=this.parser,start=p.pos;
    const fail=(code,message,span={start,end:p.pos})=>this.fail(code,message,span);
    p.need('resource','E_RESOURCE_SIGNATURE');const name=p.name('E_RESOURCE_SIGNATURE');
    if(this.side!=='client') fail('E_RESOURCE_SIDE','Resource channels require an explicit client component');
    if(this.declarations.has(name)||/^h\d+$/.test(name)) fail('E_RESOURCE_DUPLICATE',`Duplicate or reserved entry '${name}'`);
    p.trivia();if(!p.starts('(')) fail('E_RESOURCE_SIGNATURE','Declare resource name(key, ...)');
    const keySpan=p.group(),keyText=p.source.slice(keySpan.start,keySpan.end).trim(),keys=keyText?keyText.split(',').map(s=>s.trim()):[];
    if(keys.some(k=>! /^[A-Za-z_]\w*$/.test(k))||new Set(keys).size!==keys.length) fail('E_RESOURCE_KEY','Keys must be distinct primitive owner prop or state names',keySpan);
    p.trivia();p.need('{','E_RESOURCE_SIGNATURE');p.trivia();p.need('receive','E_RESOURCE_SIGNATURE');p.trivia();
    if(!p.starts('(')) fail('E_RESOURCE_SIGNATURE','Declare one typed receive(parameters) body');
    const signature=p.group(),parts=tokens(p.source,signature.start,signature.end).map(t=>t.value).join(' ').split(',').map(s=>s.trim());
    const parameters=parts.map(part=>{const match=/^([A-Za-z_]\w*)\s*:\s*([A-Za-z_]\w*(?:\s*\[\s*\])*)$/.exec(part);
      if(!match) fail('E_RESOURCE_SIGNATURE','Receive parameters require closed serializable types',signature);
      return {name:match[1],type:match[2].replace(/\s/g,'')};});
    if(!parameters.length||new Set(parameters.map(p=>p.name)).size!==parameters.length) fail('E_RESOURCE_SIGNATURE','Receive parameters must be nonempty and distinct',signature);
    p.trivia();if(!p.starts('{')) fail('E_RESOURCE_SIGNATURE','A synchronous receive body is required');
    const body=p.group();p.trivia();p.need('}','E_RESOURCE_SIGNATURE');
    const declaration={name,parameters,keys,body,start,end:p.pos,uses:1,async:false,aliases:new Map(),resource:true,proof:this.fresh()};
    this.declarations.set(name,declaration);return declaration;
  }
  checkBody(declaration) {
    const {parser}=this,ts=tokens(parser.source,declaration.body.start,declaration.body.end),edits=[];
    for(let i=0;i<ts.length;i++) {
      const token=ts[i],previous=ts[i-1]?.value,next=ts[i+1]?.value;
      const valueReference=previous!=='.' && next!==':';
      if(!valueReference) continue;
      if(declaration.parameters.some(p=>p.name===token.value) && ['=','+=','-='].includes(next)) this.fail('E_EVENT_READONLY','Capture parameters are read-only; assign to an owner state instead',token);
      if(token.value!==declaration.snapshot) {
        if(!declaration.resource && token.value==='event' && declaration.snapshot!=='event') this.fail('E_EVENT_REFERENCE',`Use the declared event parameter '${declaration.snapshot}'`,token);
        continue;
      }
      const field=ts[i+2];
      if(next!=='.' || !field) this.fail('E_EVENT_SNAPSHOT','Snapshots cannot escape as values; read an explicitly supported field',token);
      if(['preventDefault','stopPropagation','stopImmediatePropagation'].includes(field.value)) this.fail('E_EVENT_PHASE',`${field.value} must run during synchronous event delivery; use a supported attribute modifier`,{start:token.start,end:field.end});
      const allowed=field.value==='key' ? declaration.eventType==='KeyboardEvent' : ['Event','InputEvent','KeyboardEvent','FocusEvent'].includes(declaration.eventType);
      if(!fields[field.value] || !allowed) this.fail('E_EVENT_FIELD',`Snapshot field '${field.value}' is unavailable for ${declaration.eventType}`,{start:token.start,end:field.end});
      let alias=declaration.aliases.get(field.value);
      if(!alias) {alias=this.fresh();declaration.aliases.set(field.value,alias);}
      edits.push({start:token.start,end:field.end,alias});i+=2;
    }
    return edits;
  }
  appendProofs() {
    const {out,parser}=this;
    for(const d of this.declarations.values()) {
      const edits=this.checkBody(d);
      let props=parser.source.slice(this.props.start,this.props.end).trim();
      if(props.startsWith('{')) {
        // The original component still checks destructuring itself. Normalize
        // its closed inline type only for compiler-generated checker props.
        const normalized=tokens(parser.source,this.props.start,this.props.end).map(t=>t.value).join(' ');
        const record=/^\{[^}]*\}\s*:\s*\{([\s\S]*)\}$/.exec(normalized);
        if(record) props=record[1].replace(/;/g,',').trim();
        if(props.endsWith(',')) props=props.slice(0,-1);
      }
      // Parameter shadowing would make the declaration's owner ambiguous.
      const ownerNames=new Set([...tokens(parser.source,this.props.start,this.props.end).filter((_,i,a)=>a[i+1]?.value===':').map(t=>t.value),
        ...this.stateRanges.map(r=>/^\s*(?:state|derive)\s+([A-Za-z_]\w*)/.exec(parser.source.slice(r.start,r.end))?.[1])]);
      if([d.snapshot,...d.parameters.map(p=>p.name)].some(name=>ownerNames.has(name))) this.fail('E_EVENT_SIGNATURE','Event parameters cannot shadow owner props, state or derives',d);
      const parameters=[props,...d.parameters.map(p=>`${p.name}:${p.type}`),...[...d.aliases].map(([field,alias])=>`${alias}:${fields[field]}`)].filter(Boolean);
      out.insert(`\nclient component ${d.proof}(${parameters.join(',')}){`,d.start);
      this.stateRanges.forEach(r=>out.copy(r.start,r.end));
      out.insert(`<button type="button">on click ${d.async ? 'async ' : ''}entry {`,d.start);
      let copied=d.body.start;
      for(const edit of edits) {out.copy(copied,edit.start);out.insert(edit.alias,edit.start);copied=edit.end;}
      out.copy(copied,d.body.end);
      out.insert('}</button>}',d.end);
      if(d.signature) out.insert(`\ncomponent ${d.signature}(${d.parameters.map(p=>`${p.name}:${p.type}`).join(',')}){<span/>}`,d.start);
    }
  }
  bind(attribute,scope) {
    const parts=attribute.name.split('.'),kind=parts.shift().slice(3);
    if(!events[kind]) this.fail('E_EVENT_TYPE',`Unsupported event '${kind}'`,attribute);
    if(parts.some(part=>part!=='preventDefault') || new Set(parts).size!==parts.length) this.fail('E_EVENT_MODIFIER','Only .preventDefault is supported; propagation and activation operations require target-phase listeners',attribute);
    if(!attribute.value || attribute.value.kind!=='expression') this.fail('E_EVENT_BINDING','An event reference or a static argument adapter is required',attribute);
    const p=this.parser,ts=tokens(p.source,attribute.value.start,attribute.value.end);
    let name,args=[];
    if(ts.length===1 && /^[A-Za-z_]\w*$/.test(ts[0].value)) name=ts[0].value;
    else {
      // Parse a closed adapter: (e) => entry(e, expression, ...).
      let index=0,param;
      if(ts[index]?.value==='(') {index++;param=ts[index++]?.value;if(ts[index++]?.value!==')') this.fail('E_EVENT_BINDING','The adapter receives exactly one event parameter',attribute);}
      else param=ts[index++]?.value;
      if(!/^[A-Za-z_]\w*$/.test(param ?? '') || ts[index++]?.value!=='=>') this.fail('E_EVENT_BINDING','Use (e) => entry(e, args...)',attribute);
      name=ts[index++]?.value;
      if(!/^[A-Za-z_]\w*$/.test(name ?? '') || ts[index++]?.value!=='(' || ts.at(-1)?.value!==')') this.fail('E_EVENT_BINDING','An adapter must call one named event directly',attribute);
      const first=ts[index++];
      if(first?.value!==param || ![',',')'].includes(ts[index]?.value)) this.fail('E_EVENT_BINDING','Pass the adapter event as the first argument',attribute);
      if(ts[index]?.value===',') {
        index++;let start=ts[index]?.start,stack=[];
        for(;index<ts.length-1;index++) {
          const token=ts[index];
          if('([{'.includes(token.value)) stack.push(token.value);
          else if(')]}'.includes(token.value)) stack.pop();
          if(token.value===',' && !stack.length) {args.push({start,end:token.start});start=ts[index+1]?.start;}
        }
        if(start===undefined) this.fail('E_EVENT_BINDING','Missing capture argument',attribute);
        args.push({start,end:ts.at(-1).start});
      } else if(index!==ts.length-1) this.fail('E_EVENT_BINDING','An adapter must return only the named event call',attribute);
      for(const arg of args) if(tokens(p.source,arg.start,arg.end).some((t,i,all)=>t.value===param && all[i-1]?.value!=='.' && all[i+1]?.value!==':')) this.fail('E_EVENT_BINDING','Read snapshot fields inside the declaration; capture arguments must be owner or row values',arg);
    }
    const declaration=this.declarations.get(name);
    if(!declaration) this.fail('E_EVENT_REFERENCE',`Unknown event declaration '${name}'`,attribute);
    if(declaration.resource) this.fail('E_EVENT_BINDING','Resource receivers cannot be bound to DOM events',attribute);
    if(declaration.eventType!=='Event' && declaration.eventType!==events[kind]) this.fail('E_EVENT_TYPE',`${declaration.eventType} cannot be bound to ${kind}`,attribute);
    if(args.length!==declaration.parameters.length) this.fail('E_EVENT_BINDING',`Event '${name}' expects ${declaration.parameters.length} capture arguments`,attribute);
    let id=name;
    if(++declaration.uses>1) {
      let serial=declaration.uses;
      do {id=`${name}_binding${serial++}`;} while(p.source.includes(id) || this.bindings.has(id));
    }
    const binding={id,kind,declaration,args,attribute,preventDefault:parts.includes('preventDefault'),scope};
    this.bindings.set(id,binding);return binding;
  }
  emit(binding) {
    const {out}=this,{declaration:d,attribute:a}=binding;
    out.insert(`on ${binding.kind} ${d.async ? 'async ' : ''}${binding.id} {}`,a.start);
    if(d.signature) {
      out.insert(`<${d.signature}`,a.start);
      d.parameters.forEach((param,i)=>{out.insert(` ${param.name}={`,binding.args[i].start);out.copy(binding.args[i].start,binding.args[i].end);out.insert('}',binding.args[i].end);});
      out.insert('/>',a.end);
    }
  }
  restore(ir) {
    const proof=new Map(ir.components.filter(c=>this.helpers.has(c.name)).map(c=>[c.name,c]));
    const declarations=new Map();
    const owner=ir.components.find(c=>c.name===this.name);
    const unbound=[...this.declarations.values()].filter(d=>!d.uses).map(d=>({name:d.name,source:{start:d.start,end:d.end}}));
    if(unbound.length) owner.unboundEvents=unbound;
    const derives=new Map(owner.derives.map(d=>[d.name,d.value]));
    const total=expr=>{
      if(expr.kind==='name') return !derives.has(expr.name) || total(derives.get(expr.name));
      return ['number','string','boolean'].includes(expr.kind) || expr.kind==='property' && total(expr.object) || expr.kind==='array' && expr.values.every(total) || expr.kind==='record' && expr.fields.every(f=>total(f.value));
    };
    const mutable=new Set(owner.states.map(s=>s.name));
    let changed;
    do {changed=false;for(const d of owner.derives) if(!mutable.has(d.name) && [...references(d.value)].some(name=>mutable.has(name))) {mutable.add(d.name);changed=true;}} while(changed);
    for(const d of this.declarations.values()) {
      const aliases=new Map(d.resource?d.parameters.map(p=>[p.name,{kind:'message',field:p.name}]):[...d.aliases].map(([field,name])=>[name,{kind:'event',field}]));
      declarations.set(d,proof.get(d.proof).root.handlers[0].statements.map(s=>({...s,value:rewrite(s.value,aliases)})));
    }
    for(const d of this.declarations.values()) if(d.resource) {
      for(const key of d.keys) if(![...owner.props,...owner.states].some(f=>f.name===key&&['number','string','boolean'].includes(f.type)))
        this.fail('E_RESOURCE_KEY',`Resource key '${key}' must be a primitive owner prop or state`,d);
      if(owner.root.kind!=='element') this.fail('E_RESOURCE_ROOT','Resource channels require a native container root',d);
      const collides=node=>(node.handlers??[]).some(h=>h.id===d.name)||childrenOf(node).some(collides);
      if(collides(owner.root)) this.fail('E_RESOURCE_DUPLICATE',`Duplicate entry '${d.name}'`,d);
      const statements=declarations.get(d);
      const remote=expr=>expr.kind==='remote'||expressionChildren(expr).some(remote);
      if(statements.some(s=>remote(s.value))) this.fail('E_RESOURCE_EFFECT','Receive bodies must be synchronous state transitions',d);
      owner.root.handlers.push({id:d.name,event:'resource',async:false,statements,source:{start:d.start,end:d.end},channel:{name:d.name,keys:d.keys,parameters:d.parameters}});
      owner.optimizationBarrier='resource-setup';
    }
    const channels=(owner.root.handlers??[]).filter(h=>h.channel),visiting=new Set(),done=new Set();
    const check=handler=>{
      if(visiting.has(handler)) this.fail('E_RESOURCE_CYCLE','Resource results cannot feed their own key, directly or through other resources',handler.source);
      if(done.has(handler))return;visiting.add(handler);
      const writes=new Set(handler.statements.map(s=>s.target));
      for(const next of channels) if(next.channel.keys.some(key=>writes.has(key))) check(next);
      visiting.delete(handler);done.add(handler);
    };channels.forEach(check);
    const visit=node=>{
      for(const handler of node.handlers ?? []) {
        const b=this.bindings.get(handler.id);if(!b) continue;
        const d=b.declaration,call=node.children?.find(c=>c.kind==='component' && c.name===d.signature && c.source?.start===b.attribute.start);
        if(d.signature && !call) throw new Error('Missing checked event arguments');
        const args=call?.props ?? [];
        const substitutions=new Map(args.map(p=>[p.name,p.value]));
        for(const p of args) if(!total(p.value) || [...references(p.value)].some(name=>mutable.has(name) && !b.scope.includes(name))) this.fail('E_EVENT_CAPTURE','Capture immutable props or row paths/literals; read mutable owner state and perform computations inside the event body',b.attribute);
        const values=declarations.get(d),free=new Set(values.flatMap(s=>[s.target,...references(s.value)]));
        d.parameters.forEach(p=>free.delete(p.name));
        for(const name of b.scope) if(free.has(name)) this.fail('E_EVENT_SCOPE',`Row variable '${name}' shadows an owner value used by '${d.name}'`,b.attribute);
        const inspect=expr=>{
          if(expr.kind==='event') {
            const control=['input','select','textarea'].includes(node.tag),field=expr.field;
            const type=node.attributes.find(a=>a.name==='type')?.value.value;
            const valid=field==='key' ? b.kind==='keydown' : control && ['input','change','invalid','keydown','focusout'].includes(b.kind) && (field!=='checked' || node.tag==='input' && ['checkbox','radio'].includes(type));
            if(!valid) this.fail('E_EVENT_FIELD',`Snapshot field '${field}' is unavailable on this event target`,b.attribute);
          }
          expressionChildren(expr).forEach(inspect);
        };
        values.forEach(s=>inspect(s.value));
        const captureNames=new Set(args.flatMap(p=>[...references(p.value)]));
        const safe=expr=>{
          if(expr.kind==='collection' && captureNames.has(expr.parameter)) {
            const fresh=this.fresh();expr={...expr,parameter:fresh,body:rewrite(expr.body,new Map([[expr.parameter,{kind:'name',name:fresh}]]))};
          }
          // rename each lambda before substitution, including nested lambdas
          if(expr.kind==='collection') return {...expr,object:safe(expr.object),body:safe(expr.body)};
          if(expr.kind==='conditional') return {...expr,test:safe(expr.test),yes:safe(expr.yes),no:safe(expr.no)};
          if(expr.kind==='binary') return {...expr,left:safe(expr.left),right:safe(expr.right)};
          if(expr.kind==='property') return {...expr,object:safe(expr.object)};
          if(expr.kind==='index') return {...expr,object:safe(expr.object),index:safe(expr.index)};
          if(expr.kind==='method') return {...expr,object:safe(expr.object),args:expr.args.map(safe)};
          if(expr.kind==='array') return {...expr,values:expr.values.map(safe)};
          if(expr.kind==='record' || expr.kind==='remote') return {...expr,fields:expr.fields.map(f=>({...f,value:safe(f.value)}))};
          if(['not','json-parse','json-stringify'].includes(expr.kind)) return {...expr,value:safe(expr.value)};
          return expr;
        };
        handler.statements=values.map(s=>({...s,value:rewrite(safe(s.value),substitutions)}));
        handler.source={start:d.start,end:d.end};handler.binding={start:b.attribute.start,end:b.attribute.end};handler.declaration=d.name;
        if(b.preventDefault) handler.preventDefault=true;
      }
      for(const group of childGroups(node)) {
        for(let i=group.length-1;i>=0;i--) if(group[i].kind==='component' && this.helpers.has(group[i].name)) group.splice(i,1);
        group.forEach(visit);
      }
    };
    ir.components.filter(c=>c.name===this.name).forEach(c=>visit(c.root));
    ir.components=ir.components.filter(c=>!this.helpers.has(c.name));
  }
  restoreDiagnostics(diagnostics) {
    for(const diagnostic of diagnostics) if(diagnostic.code==='E_COMPONENT_PROPS') {
      const binding=[...this.bindings.values()].find(b=>diagnostic.start>=b.attribute.start && diagnostic.start<=b.attribute.end);
      if(binding) Object.assign(diagnostic,{code:'E_EVENT_ARGUMENT',message:`Capture argument type mismatch for event '${binding.declaration.name}'`,hint});
    }
  }
}
