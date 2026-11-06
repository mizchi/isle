// Parse compiler intrinsics before the closed core grammar. No evaluation or
// runtime component calls: emit checked control syntax with UTF-16 provenance.
const builtins=new Set(['Show','For','Switch','Match','ErrorBoundary','Fragment']);
const identifier=/[A-Za-z_][A-Za-z_0-9]*/y;
// Private core transport, never accepted in authored source.
const control='\u001f';
const removed=/^@(if|else|for|empty|switch|case|default|try|catch|pending)\b(?=\s|\/[/*]|[({:"'])/;

class TemplateParser {
  constructor(source) {this.source=source;this.pos=0;this.depth=0;this.nodes=0;this.serial=0;}
  error(code,message,start=this.pos,end=start+1,hint='Use the control component contracts in docs/control-components.md.') {
    throw {code,message,hint,start,end:Math.min(this.source.length,end)};
  }
  starts(value) {return this.source.startsWith(value,this.pos);}
  quoted() {
    const start=this.pos,quote=this.source[this.pos++];
    while(this.pos<this.source.length) {
      const char=this.source[this.pos++];
      if(char==='\\') this.pos++;
      else if(char===quote) return;
    }
    this.error('E_CONTROL_SYNTAX','Unterminated string',start);
  }
  trivia() {
    for(;;) {
      if(/\s/.test(this.source[this.pos] ?? '') && this.pos<this.source.length) this.pos++;
      else if(this.starts('//')) {while(this.pos<this.source.length && this.source[this.pos]!=='\n') this.pos++;}
      else if(this.starts('/*')) {
        const end=this.source.indexOf('*/',this.pos+2);
        if(end<0) this.error('E_CONTROL_SYNTAX','Unterminated comment');
        this.pos=end+2;
      } else return;
    }
  }
  need(value,code='E_CONTROL_SYNTAX') {
    this.trivia();if(!this.starts(value)) this.error(code,`Expected '${value}'`);this.pos+=value.length;
  }
  name(code='E_CONTROL_SYNTAX') {
    this.trivia();identifier.lastIndex=this.pos;
    const match=identifier.exec(this.source);
    if(!match) this.error(code,'Expected an identifier');
    this.pos=identifier.lastIndex;return match[0];
  }
  group() {
    const start=this.pos,close={'(':')','[':']','{':'}'}[this.source[this.pos++]];
    const stack=[close];
    while(this.pos<this.source.length && stack.length) {
      const char=this.source[this.pos];
      if('"\'`'.includes(char)) this.quoted();
      else if(this.starts('//') || this.starts('/*')) this.trivia();
      else if('([{'.includes(char)) {
        stack.push({'(':')','[':']','{':'}'}[char]);this.pos++;
        if(stack.length>256) this.error('E_CONTROL_LIMIT','Expression nesting limit exceeded',start);
      } else if(')]}'.includes(char)) {
        if(char!==stack.pop()) this.error('E_CONTROL_SYNTAX','Mismatched expression delimiter');
        this.pos++;
      } else this.pos++;
    }
    if(stack.length) this.error('E_CONTROL_SYNTAX','Unterminated expression',start);
    return {kind:'expression',start:start+1,end:this.pos-1};
  }
  arrow() {
    const start=this.pos,parameters=[];
    if(this.starts('(')) {
      this.pos++;this.trivia();
      if(!this.starts(')')) do {parameters.push(this.name('E_CONTROL_CHILDREN'));this.trivia();if(!this.starts(',')) break;this.pos++;} while(true);
      this.need(')','E_CONTROL_CHILDREN');
    } else parameters.push(this.name('E_CONTROL_CHILDREN'));
    this.need('=>','E_CONTROL_CHILDREN');this.trivia();
    const parenthesized=this.starts('(');if(parenthesized) {this.pos++;this.trivia();}
    if(!this.starts('<')) this.error('E_CONTROL_CHILDREN','Return one inline template; statement bodies and render helpers are not supported',start);
    const body=this.element();
    if(parenthesized) this.need(')','E_CONTROL_CHILDREN');
    return {kind:'function',parameters,body,start,end:this.pos};
  }
  attributeValue(name,tag) {
    this.trivia();const start=this.pos;
    if(this.starts('{')) {
      if(name==='fallback' && builtins.has(tag)) {
        this.pos++;this.trivia();
        let value;
        if(this.starts('<')) value=this.element();
        else {
          const saved=this.pos;
          // Only ErrorBoundary permits a function-valued fallback.
          if(tag==='ErrorBoundary' && /^(?:\([^)]*\)|[A-Za-z_]\w*)\s*=>/.test(this.source.slice(saved))) value=this.arrow();
          else if(this.starts('(') && /^\(\s*</.test(this.source.slice(saved))) {this.pos++;this.trivia();value=this.element();this.need(')');}
          else {this.pos=start;return this.group();}
        }
        this.need('}');return value;
      }
      return this.group();
    }
    if(this.starts('"') || this.starts("'")) {this.quoted();return {kind:'expression',start,end:this.pos};}
    this.error('E_CONTROL_PROP','Attributes require a quoted value or braced expression',start);
  }
  element() {
    const start=this.pos;
    if(++this.depth>128 || ++this.nodes>10000) this.error('E_CONTROL_LIMIT','Template complexity limit exceeded',start);
    this.need('<');
    const short=this.starts('>');
    let tag='Fragment';
    if(!short) {
      const match=/^[A-Za-z_][A-Za-z_0-9:-]*/.exec(this.source.slice(this.pos));
      if(!match) this.error('E_CONTROL_SYNTAX','Expected a template tag');
      tag=match[0];this.pos+=tag.length;
    }
    const attributes=[];
    while(true) {
      const before=this.pos;this.trivia();
      if(this.starts('>') || this.starts('/>')) break;
      const match=/^[A-Za-z_][A-Za-z_0-9:-]*/.exec(this.source.slice(this.pos));
      if(!match) this.error('E_CONTROL_SYNTAX','Expected an attribute');
      const name=match[0];this.pos+=name.length;this.trivia();
      let value;
      if(this.starts('=')) {this.pos++;value=this.attributeValue(name,tag);}
      attributes.push({name,value,start:before,end:this.pos});
    }
    const selfClosing=this.starts('/>');this.pos+=selfClosing ? 2 : 1;
    const openEnd=this.pos;
    const children=[];
    if(!selfClosing) {
      if(tag==='For') {
        this.trivia();this.need('{','E_CONTROL_CHILDREN');this.trivia();
        children.push(this.arrow());this.need('}','E_CONTROL_CHILDREN');this.trivia();
        if(!this.starts('</')) this.error('E_CONTROL_CHILDREN','For requires exactly one inline template function');
      } else children.push(...this.children('</'));
      this.need('</');
      if(!short) this.need(tag);
      this.need('>');
    }
    this.depth--;
    return {kind:'element',tag,short,attributes,children,start,end:this.pos,openEnd,selfClosing};
  }
  children(stop) {
    const children=[];
    while(this.pos<this.source.length && !this.starts(stop)) {
      const start=this.pos;
      if(this.starts('<')) children.push(this.element());
      else if(this.starts('{')) {this.group();children.push({kind:'raw',start,end:this.pos});}
      else if(this.starts('@')) {
        const directive=removed.exec(this.source.slice(start));
        if(directive) this.error('E_CONTROL_REMOVED',`${directive[0]} is no longer part of the language`,start,start+directive[0].length,'Use Show, For, Switch / Match or ErrorBoundary. Put row keys on the returned root or Fragment.');
        this.pos++;children.push({kind:'raw',start,end:this.pos});
      } else {
        while(this.pos<this.source.length && !this.starts(stop) && !'<{@'.includes(this.source[this.pos])) this.pos++;
        children.push({kind:'raw',start,end:this.pos});
      }
    }
    if(this.pos>=this.source.length) this.error('E_CONTROL_SYNTAX','Unterminated template');
    return children;
  }
  fresh() {let name;do {name=`__isle_error_${this.serial++}`;} while(this.source.includes(name));return name;}
}

class Emitter {
  constructor(source,parser) {this.original=source;this.parser=parser;this.parts=[];this.positions=[];this.length=0;}
  copy(start,end) {this.parts.push(this.original.slice(start,end));for(let i=start;i<end;i++) this.positions[this.length++]=i;}
  insert(text,at) {this.parts.push(text);for(let i=0;i<text.length;i++) this.positions[this.length++]=at;}
  fail(node,code,message) {this.parser.error(code,message,node.start,node.end);}
  props(node,allowed,rootKey) {
    const props=new Map();
    for(const attribute of node.attributes) {
      if(attribute.name==='key') {
        if(!rootKey) this.fail(attribute,'E_CONTROL_KEY','key is only valid on the returned root of a For row');
        continue;
      }
      if(!allowed.includes(attribute.name) || props.has(attribute.name)) this.fail(attribute,'E_CONTROL_PROP',`Unknown or duplicate ${node.tag} prop '${attribute.name}'`);
      if(!attribute.value) this.fail(attribute,'E_CONTROL_PROP',`A value is required for '${attribute.name}'`);
      props.set(attribute.name,attribute.value);
    }
    return props;
  }
  expression(value,node) {
    if(!value || value.kind!=='expression') this.fail(node,'E_CONTROL_PROP','A pure expression is required');
    this.copy(value.start,value.end);
  }
  body(nodes) {nodes.forEach(node=>this.node(node));}
  fallback(value) {
    if(!value) return;
    if(value.kind==='element') this.node(value);
    else if(value.kind==='expression') {this.insert('{',value.start);this.copy(value.start,value.end);this.insert('}',value.end);}
    else this.fail(value,'E_CONTROL_PROP','This fallback requires a template or a pure value');
  }
  node(node,rootKey=false) {
    if(node.kind==='raw') {this.copy(node.start,node.end);return;}
    const at=node.start,keys=node.attributes.filter(attr=>attr.name==='key');
    if(keys.length>1 || keys.length && !rootKey) this.fail(keys[0],'E_CONTROL_KEY','Specify key once, on the returned root of a For row');
    if(node.tag==='For') {
      const props=this.props(node,['each','fallback'],rootKey),fn=node.children[0];
      if(node.children.length!==1 || fn?.kind!=='function' || fn.parameters.length<1 || fn.parameters.length>2) this.fail(node,'E_CONTROL_CHILDREN','For requires an inline (item, index?) => template function');
      const rowKeys=fn.body.attributes.filter(attr=>attr.name==='key');
      if(rowKeys.length!==1 || !rowKeys[0].value) this.fail(fn.body,'E_CONTROL_KEY','The returned row root or named Fragment requires one explicit key');
      this.insert(`${control}for(const ${fn.parameters[0]} of (`,at);this.expression(props.get('each'),node);
      this.insert(`);${fn.parameters[1] ? `index ${fn.parameters[1]};` : ''}key `,at);this.expression(rowKeys[0].value,rowKeys[0]);
      this.insert('){',at);this.node(fn.body,true);this.insert(`}${control}empty{`,at);this.fallback(props.get('fallback'));this.insert('}',at);return;
    }
    if(node.tag==='Show') {
      const props=this.props(node,['when','fallback'],rootKey);
      this.insert(`${control}if(`,at);this.expression(props.get('when'),node);this.insert('){',at);this.body(node.children);
      this.insert(`}${control}else{`,at);this.fallback(props.get('fallback'));this.insert('}',at);return;
    }
    if(node.tag==='Switch') {
      const props=this.props(node,['fallback'],rootKey);let count=0;
      for(const child of node.children) {
        if(child.kind==='raw' && !this.original.slice(child.start,child.end).trim()) continue;
        if(child.tag!=='Match') this.fail(child,'E_CONTROL_CHILDREN','Switch accepts direct Match children only');
        const match=this.props(child,['when'],false);
        this.insert(count++ ? `${control}else if(` : `${control}if(`,child.start);this.expression(match.get('when'),child);
        this.insert('){',child.start);this.body(child.children);this.insert('}',child.start);
      }
      if(!count) this.insert(`${control}if(false){}`,at);
      this.insert(`${control}else{`,at);this.fallback(props.get('fallback'));this.insert('}',at);return;
    }
    if(node.tag==='Match') this.fail(node,'E_CONTROL_CONTEXT','Match must be a direct child of Switch');
    if(node.tag==='ErrorBoundary') {
      const props=this.props(node,['fallback'],rootKey),fallback=props.get('fallback');
      if(!fallback) this.fail(node,'E_CONTROL_PROP','ErrorBoundary requires a fallback');
      if(fallback.kind==='function' && fallback.parameters.length!==1) this.fail(fallback,'E_CONTROL_CHILDREN','Error fallback receives one public error string; reset callbacks are not supported');
      this.insert(`${control}try{`,at);this.body(node.children);
      this.insert(`}${control}catch(${fallback.kind==='function' ? fallback.parameters[0] : this.parser.fresh()}){`,at);
      if(fallback.kind==='function') this.node(fallback.body);else this.fallback(fallback);
      this.insert('}',at);return;
    }
    if(node.tag==='Fragment') {
      this.props(node,[],rootKey);this.body(node.children);return;
    }
    // Preserve native/component syntax exactly, erasing only the consumed row key.
    if(keys.length) {this.copy(at,keys[0].start);this.copy(keys[0].end,node.openEnd);} else this.copy(at,node.openEnd);
    this.body(node.children);
    if(!node.selfClosing) this.copy(this.closingStart(node),node.end);
  }
  closingStart(node) {return this.original.lastIndexOf('</',node.end-1);}
  restore(value) {
    if(Array.isArray(value)) {value.forEach(item=>this.restore(item));return;}
    if(!value || typeof value!=='object') return;
    if(Number.isInteger(value.start) && Number.isInteger(value.end)) {
      const start=this.positions[value.start] ?? this.original.length,end=this.positions[value.end] ?? this.original.length;
      value.start=start;value.end=Math.min(this.original.length,Math.max(start+1,end));
    }
    Object.values(value).forEach(item=>this.restore(item));
  }
}

export function lowerControlSyntax(source) {
  const identity={source,restore:()=>{}};
  const internal=source.indexOf(control);
  if(internal>=0) throw {code:'E_CONTROL_INTERNAL',message:'Reserved compiler control character in source',hint:'Use control components. Control characters in string data must be escaped.',start:internal,end:internal+1};
  if(!/@|<(?:Show|For|Switch|Match|ErrorBoundary|Fragment)(?=[\s/>])|<>|\bkey\s*=|\bcomponent\s+(?:Show|For|Switch|Match|ErrorBoundary|Fragment)\b/.test(source)) return identity;
  const parser=new TemplateParser(source),out=new Emitter(source,parser);let copied=0,changed=false;
  while(parser.pos<source.length) {
    parser.trivia();if(parser.pos>=source.length) break;
    const char=source[parser.pos];
    if('"\'`'.includes(char)) {parser.quoted();continue;}
    identifier.lastIndex=parser.pos;const word=identifier.exec(source);
    if(!word) {parser.pos++;continue;}
    parser.pos=identifier.lastIndex;
    if(word[0]!=='component') continue;
    parser.trivia();const saved=parser.pos;
    if(!/[A-Za-z_]/.test(source[parser.pos] ?? '')) continue;
    const name=parser.name();parser.trivia();if(!parser.starts('(')) {parser.pos=saved+name.length;continue;}
    if(builtins.has(name)) parser.error('E_CONTROL_RESERVED',`'${name}' is a compiler intrinsic`,saved,saved+name.length);
    parser.group();parser.trivia();if(!parser.starts('{')) continue;parser.pos++;parser.trivia();
    // Declarations are not templates; comparisons and quoted tags stay untouched.
    while(/^(?:state|derive)\b/.test(source.slice(parser.pos))) {
      while(parser.pos<source.length && !parser.starts(';')) {
        const c=source[parser.pos];
        if('"\'`'.includes(c)) parser.quoted();
        else if('([{'.includes(c)) parser.group();
        else if(parser.starts('//') || parser.starts('/*')) parser.trivia();
        else parser.pos++;
      }
      if(parser.starts(';')) parser.pos++;parser.trivia();
    }
    if(!parser.starts('<')) continue;
    const start=parser.pos,node=parser.element();
    if(builtins.has(node.tag)) parser.error('E_CONTROL_ROOT','A component still requires one native container root',node.start,node.openEnd,'Wrap the control component or Fragment in a native element.');
    out.copy(copied,start);out.node(node);copied=parser.pos;changed=true;
  }
  if(!changed) return identity;
  out.copy(copied,source.length);out.positions[out.length]=source.length;
  return {source:out.parts.join(''),restore:value=>out.restore(value)};
}
