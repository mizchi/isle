import './a.css';
globalThis.styleModuleEvaluations=(globalThis.styleModuleEvaluations??0)+1;
export function setup({root,owner,id}){
  (globalThis.styleSetups??=[]).push({id,root,owner,phase:getComputedStyle(root).getPropertyValue('--phase').trim()});
}
