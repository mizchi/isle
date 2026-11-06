import type {ProgramIR,Diagnostic,WireValue} from './contracts.d.ts';
import type {ProgramExplanation} from './compiler.mjs';
export {compile,checkDependencies,requireIR,explain} from './compiler.mjs';
export type {ProgramExplanation,ComponentExplanation,BoundaryExplanation} from './compiler.mjs';
export type * from './contracts.d.ts';
export interface PreviewOptions {component?:string;props?:Record<string,WireValue>;mode?:'resume'|'ssr'}
export interface PreviewArtifact {
  version:1;component:string;mode:'resume'|'ssr';html:string;snapshotHtml:string;
  modules:{id:string;code:string}[];
  entries:Record<string,{module:string;symbol:string;captures:number[]}>;
  schemas:Record<string,import('./contracts.d.ts').ValueType[]>;
  events:string[];
}
export type PreviewCompileResult = {ok:true;ir:ProgramIR;explanation:ProgramExplanation;preview:PreviewArtifact} |
  {ok:false;stage:'compile'|'render';diagnostics:Diagnostic[];ir?:ProgramIR};
export function compilePreview(source:string,options?:PreviewOptions):PreviewCompileResult;
