import {createContractIR} from './layout-contract.mjs';
import {simpleSelector} from './layout/simple-selector.mjs';

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
  selector() {
    const p=this.parser;p.trivia();const start=p.pos;
    if(p.source[p.pos]!== '"') this.fail('E_LAYOUT_SYNTAX','Use a double-quoted simple selector',start);
    p.quoted();
    try {return JSON.parse(p.source.slice(start,p.pos));}
    catch {this.fail('E_LAYOUT_SYNTAX','Invalid selector string',start,p.pos);}
  }
  declaration() {
    const p=this.parser,start=p.pos;
    if(this.value) this.fail('E_LAYOUT_DUPLICATE','A component has one layout declaration',start);
    try {
      p.need('layout','E_LAYOUT_SYNTAX');const profile=this.word();
      if(!['SafeGrid','PositionedGrid'].includes(profile)) this.fail('E_LAYOUT_PROFILE',`Unknown layout profile '${profile}'`,start,p.pos);
      p.need('{','E_LAYOUT_SYNTAX');const sections=new Map(),spaces=[],overlays=[],noshift=[];p.trivia();
      while(!p.starts('}')) {
        if(p.pos-start>16384) this.fail('E_LAYOUT_LIMIT','Layout declaration exceeds 16 KiB',start,p.pos);
        const section=this.word();
        if(['space','overlay'].includes(section)) {
          if(profile!=='PositionedGrid') this.fail('E_LAYOUT_PROFILE','Named spaces and overlays require PositionedGrid');
          if(spaces.length+overlays.length>=128) this.fail('E_LAYOUT_LIMIT','Too many positioned bindings');
          if(section==='space') {const name=p.name('E_LAYOUT_SYNTAX');p.need('=','E_LAYOUT_SYNTAX');spaces.push({name,selector:this.selector()});}
          else {const selector=this.selector();p.need('within','E_LAYOUT_SYNTAX');overlays.push({selector,within:p.name('E_LAYOUT_SYNTAX')});}
          p.need(';','E_LAYOUT_SYNTAX');p.trivia();continue;
        }
        if(!['requires','ensures'].includes(section)) this.fail('E_LAYOUT_SYNTAX',`Unknown layout section '${section}'`);
        if(sections.has(section)) this.fail('E_LAYOUT_DUPLICATE',`Duplicate ${section} section`);
        p.need('{','E_LAYOUT_SYNTAX');const fields=new Map();p.trivia();
        while(!p.starts('}')) {
          const at=p.pos,field=this.word(),allowed=section==='requires' ? ['inline-size','block-size'] : ['overflow-inline','overflow-block'];
          if(section==='ensures' && field==='noshift') {
            const selector=this.selector();p.need(';','E_LAYOUT_SYNTAX');
            if(!selector || selector.length>256 || !simpleSelector.test(selector)) this.fail('E_LAYOUT_SYNTAX','noshift requires a simple tag/id/class selector (at most 256 characters)',at,p.pos);
            if(noshift.some(target=>target.selector===selector)) this.fail('E_LAYOUT_DUPLICATE','Duplicate noshift target',at,p.pos);
            if(noshift.length>=32) this.fail('E_LAYOUT_LIMIT','At most 32 noshift targets',at,p.pos);
            noshift.push({selector,source:{start:at,end:p.pos}});p.trivia();continue;
          }
          if(!allowed.includes(field)) this.fail('E_LAYOUT_SYNTAX',`Unknown ${section} field '${field}'`,at,p.pos);
          if(fields.has(field)) this.fail('E_LAYOUT_DUPLICATE',`Duplicate ${field}`,at,p.pos);
          p.need(':','E_LAYOUT_SYNTAX');let value;
          if(section==='requires') {const min=this.pixels();p.need('..','E_LAYOUT_RANGE');const max=this.pixels();value={min,max};}
          else {value=this.word();if(value!=='fit') this.fail('E_LAYOUT_PROFILE','Layout profiles currently guarantee fit on both axes',at,p.pos);}
          p.need(';','E_LAYOUT_SYNTAX');fields.set(field,value);p.trivia();
        }
        p.need('}','E_LAYOUT_SYNTAX');sections.set(section,fields);p.trivia();
      }
      p.need('}','E_LAYOUT_SYNTAX');const end=p.pos;
      if(end-start>16384) this.fail('E_LAYOUT_LIMIT','Layout declaration exceeds 16 KiB',start,end);
      const required=sections.get('requires'),ensures=sections.get('ensures');
      let contract;
      try {contract=createContractIR({component:this.name,...(profile==='PositionedGrid' ? {profile:'positioned-grid/1',spaces,overlays} : {}),requires:{inlineSize:required?.get('inline-size'),blockSize:required?.get('block-size')},
        ...(ensures?.size ? {ensures:{inline:ensures.get('overflow-inline'),block:ensures.get('overflow-block')}} : {})});}
      catch(error) {this.fail('E_LAYOUT_CONTRACT',error.message,start,end);}
      this.value={contract,source:{start,end},...(noshift.length ? {noshift} : {})};return {start,end};
    } catch(error) {
      if(error.code==='E_CONTROL_SYNTAX') throw {...error,code:'E_LAYOUT_SYNTAX',hint};
      throw error;
    }
  }
  attach(ir) {
    if(!this.value) return;
    const component=ir.components.find(c=>c.name===this.name);
    component.layout=this.value;
    // Selector resolution and state enumeration belong to the Isle adapter.
    component.root.layoutContracts=[{contract:this.value.contract,source:this.value.source}];
  }
}
