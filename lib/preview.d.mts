import type {PreviewArtifact} from './compiler-browser.mjs';
export const previewRuntimeURL: URL;
export interface PreviewDocumentOptions {css?:string;runtimeSource?:string;token?:string}
export function createPreviewDocument(artifact:PreviewArtifact,options?:PreviewDocumentOptions):string;
export function mountPreview(frame:HTMLIFrameElement,artifact:PreviewArtifact,options?:PreviewDocumentOptions):string;
