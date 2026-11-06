globalThis.setupEvaluations=(globalThis.setupEvaluations??0)+1;
export function setup({root,owner}){
  globalThis.setupInvocations=(globalThis.setupInvocations??0)+1;
  owner.own(root,()=>{globalThis.setupReleases=(globalThis.setupReleases??0)+1;});
}
