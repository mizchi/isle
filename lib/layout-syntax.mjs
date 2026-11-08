import {createContractIR} from './layout-contract.mjs';

const hint='Declare layout SafeGrid { requires { inline-size: 160px..640px; block-size: 40px..640px; } } before the template.';

/** Component statement grammar, parsed with the existing lexical/source map. */
export class ComponentLayout {
  constructor(parser,name) {this.parser=parser;this.name=name;}
  fail(code,message,start=this.parser.pos,end=start+1) {this.parser.error(code,message,start,end,hint);}
  word() {
    const p=this.parser;p.trivia();const match=/^[A-Za-z_][\w-]*/.exec(p.source.slice(p.pos));
    if(!match) this.fail('E_LAYOUT_SYNTAX','Expected a layout field');
    p.pos+=match[0].length;return match[0];
  }
  pixels() {
    const p=this.parser;p.trivia();const start=p.pos,match=/^(?:0|[1-9]\d*)(?:\.\d{1,6})?px(?=\s|\.|;|}|\/)/.exec(p.source.slice(p.pos));
    if(!match) this.fail('E_LAYOUT_RANGE','Use a nonnegative px bound with at most six decimal places',start);
    p.pos+=match[0].length;return Number(match[0].slice(0,-2));
  }
  declaration() {
    const p=this.parser,start=p.pos;
    if(this.value) this.fail('E_LAYOUT_DUPLICATE','A component has one layout declaration',start);
    try {
      p.need('layout','E_LAYOUT_SYNTAX');const profile=this.word();
      if(profile!=='SafeGrid') this.fail('E_LAYOUT_PROFILE',`Unknown layout profile '${profile}'`,start,p.pos);
      p.need('{','E_LAYOUT_SYNTAX');const sections=new Map();p.trivia();
      while(!p.starts('}')) {
        if(p.pos-start>16384) this.fail('E_LAYOUT_LIMIT','Layout declaration exceeds 16 KiB',start,p.pos);
        const section=this.word();
        if(!['requires','ensures'].includes(section)) this.fail('E_LAYOUT_SYNTAX',`Unknown layout section '${section}'`);
        if(sections.has(section)) this.fail('E_LAYOUT_DUPLICATE',`Duplicate ${section} section`);
        p.need('{','E_LAYOUT_SYNTAX');const fields=new Map();p.trivia();
        while(!p.starts('}')) {
          const at=p.pos,field=this.word(),allowed=section==='requires' ? ['inline-size','block-size'] : ['overflow-inline','overflow-block'];
          if(!allowed.includes(field)) this.fail('E_LAYOUT_SYNTAX',`Unknown ${section} field '${field}'`,at,p.pos);
          if(fields.has(field)) this.fail('E_LAYOUT_DUPLICATE',`Duplicate ${field}`,at,p.pos);
          p.need(':','E_LAYOUT_SYNTAX');let value;
          if(section==='requires') {const min=this.pixels();p.need('..','E_LAYOUT_RANGE');const max=this.pixels();value={min,max};}
          else {value=this.word();if(value!=='fit') this.fail('E_LAYOUT_PROFILE','SafeGrid currently guarantees fit on both axes',at,p.pos);}
          p.need(';','E_LAYOUT_SYNTAX');fields.set(field,value);p.trivia();
        }
        p.need('}','E_LAYOUT_SYNTAX');sections.set(section,fields);p.trivia();
      }
      p.need('}','E_LAYOUT_SYNTAX');const end=p.pos;
      if(end-start>16384) this.fail('E_LAYOUT_LIMIT','Layout declaration exceeds 16 KiB',start,end);
      const required=sections.get('requires'),ensures=sections.get('ensures');
      let contract;
      try {contract=createContractIR({component:this.name,requires:{inlineSize:required?.get('inline-size'),blockSize:required?.get('block-size')},
        ...(ensures ? {ensures:{inline:ensures.get('overflow-inline'),block:ensures.get('overflow-block')}} : {})});}
      catch(error) {this.fail('E_LAYOUT_CONTRACT',error.message,start,end);}
      this.value={contract,source:{start,end}};return {start,end};
    } catch(error) {
      if(error.code==='E_CONTROL_SYNTAX') throw {...error,code:'E_LAYOUT_SYNTAX',hint};
      throw error;
    }
  }
  attach(ir) {
    if(!this.value) return;
    const component=ir.components.find(c=>c.name===this.name);
    component.layout=this.value;
    component.root.layoutContracts=[this.value];
  }
}
