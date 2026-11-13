import {and,or} from './smt.mjs';

/** Shared bounded query encoding; predicates remain the caller's responsibility. */
export function obligationModel(base,domain,input) {
  const sourceObligations=input.length;
  const obligations=[...new Map(input.map(row=>[
    JSON.stringify([row.code,row.box,row.path,row.axis,row.variant,row.scrollbarProfile,row.domain,row.failure]),row,
  ])).values()];
  if(obligations.length>8192) throw new RangeError('Layout obligation limit exceeded');
  const prelude=`(set-logic QF_LRA)\n(declare-const width Real)\n(declare-const height Real)\n(declare-const layout_case Real)\n(assert ${domain})\n`;
  const smt2=prelude+`(assert ${or(obligations.map((row,i)=>and([`(= layout_case ${i})`,row.domain,row.failure])))})\n`;
  if(smt2.length>2_000_000) throw new RangeError('Layout model size limit exceeded');
  return {...base,version:1,sourceObligations,domain:prelude,smt2,obligations};
}
