import {compilePreview,compile,explain,type PreviewArtifact} from '@isle/prototype/compiler/browser';
import {createPreviewDocument,mountPreview,previewRuntimeURL} from '@isle/prototype/preview';
const compiled=compilePreview('component Page(){<p>Hello</p>}',{mode:'ssr',props:{}});
if(compiled.ok) {
  const artifact:PreviewArtifact=compiled.preview;
  createPreviewDocument(artifact,{css:'body{margin:0}'});
  mountPreview(document.createElement('iframe'),artifact);
  explain(compiled.ir);
}
void [compile,previewRuntimeURL];
// @ts-expect-error The browser API has no file I/O.
import {compileFile} from '@isle/prototype/compiler/browser';
// @ts-expect-error Render modes are bounded.
compilePreview('',{mode:'hydrate'});
