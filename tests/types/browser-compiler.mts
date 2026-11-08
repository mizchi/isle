import {compilePreview,compile,explain,type PreviewArtifact,type WarningDiagnostic} from '@isle/prototype/compiler/browser';
import {createPreviewDocument,mountPreview,previewRuntimeURL} from '@isle/prototype/preview';
const compiled=compilePreview('component Page(){<p>Hello</p>}',{mode:'ssr',props:{}});
if(compiled.ok) {
  const warnings:WarningDiagnostic[]=compiled.diagnostics;
  const artifact:PreviewArtifact=compiled.preview;
  createPreviewDocument(artifact,{css:'body{margin:0}'});
  mountPreview(document.createElement('iframe'),artifact);
  explain(compiled.ir);
  void warnings;
}
const checked=compile('component C(){<p>Static</p>}',{externalObservers:['C']});
if(checked.ok) {const severity:'warning'|undefined=checked.diagnostics[0]?.severity;void severity;}
// @ts-expect-error Successful compilation cannot contain error diagnostics.
const successWarning:WarningDiagnostic={code:'W_UNOBSERVED_VALUE',severity:'error',start:0,end:1,message:'unused',hint:'remove'};
// @ts-expect-error External observers are a closed global flag or named owner list.
compile('',{externalObservers:'C'});
void successWarning;
void [compile,previewRuntimeURL];
// @ts-expect-error The browser API has no file I/O.
import {compileFile} from '@isle/prototype/compiler/browser';
// @ts-expect-error Render modes are bounded.
compilePreview('',{mode:'hydrate'});
