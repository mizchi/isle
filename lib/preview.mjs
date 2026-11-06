import {escapeHtml,encodeSnapshot} from './html.mjs';
import {styleTags} from './styles.mjs';
/** Self-contained ESM, copied as an asset by Vite. No compiler import in the host UI. */
export const previewRuntimeURL=new URL('../_build/browser/preview-runtime.txt',import.meta.url);

export function createPreviewDocument(artifact,{css='',runtimeSource,token=''}={}) {
  if(artifact?.version!==1 || typeof artifact.html!=='string' || typeof artifact.snapshotHtml!=='string' || !Array.isArray(artifact.events)) throw new TypeError('Invalid preview artifact');
  if(typeof css!=='string' || css.length>131072) throw new TypeError('Preview CSS size limit exceeded');
  const interactive=artifact.events.length>0;
  if(interactive && (typeof runtimeSource!=='string' || !runtimeSource)) throw new TypeError('Interactive preview requires a self-contained runtime source');
  const policy=`default-src 'none'; script-src ${interactive ? "'unsafe-inline' blob:" : "'none'"}; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'; frame-src 'none'`;
  const bootstrap=interactive ? `<script type="module">
const artifact=${encodeSnapshot(artifact)},token=${encodeSnapshot(token)};
const report=data=>parent.postMessage({channel:'isle-preview',token,...data},'*');
addEventListener('error',event=>report({type:'error',message:event.message}));
addEventListener('unhandledrejection',event=>report({type:'error',message:String(event.reason?.message ?? event.reason)}));
try {
  const url=URL.createObjectURL(new Blob([${encodeSnapshot(runtimeSource)}],{type:'text/javascript'}));
  const runtime=await import(url);URL.revokeObjectURL(url);globalThis.__islePreviewRuntime=runtime;
  const close=await runtime.startPreview(document,artifact,report);
  addEventListener('pagehide',close,{once:true});
} catch(error) {report({type:'error',message:error.message});}
</script>` : '';
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${escapeHtml(policy)}"><style>${css.replace(/<\/style/gi,'<\\/style')}</style>${styleTags(artifact.styles)}</head><body>${artifact.html}${artifact.snapshotHtml}${bootstrap}</body></html>`;
}

/** Use only an iframe: never insert a preview document into the editor's DOM. */
export function mountPreview(frame,artifact,options={}) {
  const token=crypto.randomUUID();
  const html=createPreviewDocument(artifact,{...options,token});
  frame.setAttribute('sandbox','allow-scripts allow-forms');
  frame.setAttribute('referrerpolicy','no-referrer');
  frame.srcdoc=html;
  return token;
}
