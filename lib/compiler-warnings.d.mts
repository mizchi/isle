import type {ProgramIR,Diagnostic,WarningDiagnostic} from './contracts.d.ts';
export function unobservedWarnings(ir:ProgramIR):WarningDiagnostic[];
export function diagnosticLocation(source:string,diagnostic:Diagnostic):{line:number;column:number};
export function formatWarning(diagnostic:WarningDiagnostic,source:string,file:string):string;
