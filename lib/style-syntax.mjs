import parse from 'css-tree/parser';
import generate from 'css-tree/generator';
import walk from 'css-tree/walker';
import {List} from 'css-tree/utils';
import {tokenize,tokenTypes as token} from 'css-tree/tokenizer';
import {sha256} from './sha256.mjs';

/** Compile-only CSS ownership. No stylesheet parser reaches an app's runtime. */
export class ComponentStyles {
  constructor(source,name,root,parser) {
    this.blocks=[];
    const fail=(code,message,node)=>parser.error(code,message,node.start,node.end,'Put static CSS in a direct <style> child of the native component root.');
    const visit=(node,parent)=>{
      if(node.kind==='style') {
        if(parent!==root || /^[A-Z]/.test(root.tag)) fail('E_CSS_PLACEMENT','Styles must be unconditional direct children of a native component root',node);
        this.blocks.push(node);return;
      }
      for(const child of node.children ?? []) visit(child.kind==='function' ? child.body : child,node);
      for(const attr of node.attributes ?? []) if(attr.value?.kind==='element') visit(attr.value,node);
      else if(attr.value?.kind==='function') visit(attr.value.body,node);
    };
    visit(root);
    if(!this.blocks.length) return;
    const authored=this.blocks.map(b=>source.slice(b.cssStart,b.cssEnd)).join('\n');
    this.scope='i_'+sha256(name+'\0'+authored).slice(0,12);
    const sheets=this.blocks.map(block=>{
      let css;
      const text=source.slice(block.cssStart,block.cssEnd),stack=[];
      const error=(message,offset)=>{throw Object.assign(new Error(message),{offset});};
      try {
        tokenize(text,(kind,start,end)=>{
          const close=kind===token.Function || kind===token.LeftParenthesis ? token.RightParenthesis : kind===token.LeftCurlyBracket ? token.RightCurlyBracket : kind===token.LeftSquareBracket ? token.RightSquareBracket : undefined;
          if(close) {stack.push({close,start});if(stack.length>128) error('CSS nesting limit exceeded',start);}
          else if([token.RightParenthesis,token.RightCurlyBracket,token.RightSquareBracket].includes(kind) && stack.pop()?.close!==kind) error('Mismatched CSS delimiter',start);
          else if(kind===token.BadString || kind===token.BadUrl) error('Malformed CSS string or URL',start);
          else if(kind===token.Comment && !text.slice(start,end).endsWith('*/')) error('Unterminated CSS comment',start);
          else if(kind===token.String && text[start]!==text[end-1]) error('Unterminated CSS string',start);
        });
        if(stack.length) error('Unclosed CSS block or function',stack[0].start);
        css=parse(text,{positions:true,onParseError:error=>{throw error;}});
      } catch(error) {
        const start=block.cssStart+(error.offset ?? 0);
        parser.error('E_CSS_SYNTAX',error.message,start,start+1,'Use static, balanced CSS rules.');
      }
      let ruleDepth=0;
      walk(css,{
        enter:node=>{
          if(node.type==='Atrule') {
            if(ruleDepth) fail('E_CSS_NESTING','Use flat CSS rules and top-level conditional blocks',block);
            if(!['media','container','layer','supports'].includes(node.name.toLowerCase())) fail('E_CSS_CAPABILITY',`Scoped styles do not support @${node.name}`,block);
          }
          if(node.type!=='Rule') return;
          if(ruleDepth++) fail('E_CSS_NESTING','Nested CSS selectors require an explicit adapter; use flat rules',block);
          if(node.prelude.type!=='SelectorList') fail('E_CSS_SYNTAX','A valid CSS selector is required',block);
          const selectors=[];
          node.prelude.children.forEach(selector=>{
            const parts=selector.children.toArray();
            const index=parts.findIndex(p=>p.type==='PseudoElementSelector' || p.type==='PseudoClassSelector' && ['before','after'].includes(p.name.toLowerCase()));
            const before=index<0 ? parts : parts.slice(0,index),after=index<0 ? [] : parts.slice(index);
            const children=new List();before.forEach(p=>children.appendData(p));
            const target=generate({...selector,children}) || '*';
            selectors.push(`:is(${target}).${this.scope}${after.map(p=>generate(p)).join('')}`);
          });
          node.prelude=parse(selectors.join(','),{context:'selectorList'});
        },
        leave:node=>{if(node.type==='Rule') ruleDepth--;},
      });
      return generate(css);
    });
    this.style={id:name+'.'+this.scope,scope:this.scope,css:sheets.join('\n'),sources:this.blocks.map(b=>({start:b.cssStart,end:b.cssEnd}))};
  }
  attach(ir,name) {if(this.style) ir.components.find(c=>c.name===name).style=this.style;}
}
