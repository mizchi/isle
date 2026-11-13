// Isle adapter: only this layer knows about ProgramIR and component templates.
import {extractBoxes} from './input.mjs';
import {analyzeBoxTree} from '../../packages/css-verifier/src/layout/engine.mjs';

export function analyzeLayout(ir,options,scrollbarProfile,budget,inlineSheets=[]) {
  const component=options.component ?? ir.components[0]?.name;
  const diagnostics=[];
  const unknown=(code,message,line,box)=>diagnostics.push({code,severity:'unknown',message,
    ...(line ? {css:{file:options.cssFile ?? '<css>',line}} : {}),
    ...(box ? {box:box.label,path:box.path,source:box.source} : {})});
  const root=extractBoxes(ir,component,unknown);
  const {component:_,props,...configuration}=options;
  return analyzeBoxTree(root,{...configuration,name:component},scrollbarProfile,budget,inlineSheets,diagnostics);
}
