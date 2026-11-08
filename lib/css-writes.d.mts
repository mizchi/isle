/** Compiler policy only: no parsing, value evaluation, or cross-rule cascade proof. */
export interface CSSWriteConflict {
  earlier:number;
  later:number;
  properties:[string,string];
  longhands:string[];
  hint:string;
}
export function findCSSWriteConflicts(properties:readonly string[]):CSSWriteConflict[];
export function cssWriteConflictMessage(conflict:CSSWriteConflict):string;
