// Shared encoding only. Contract predicates and CSS geometry are built separately.
export function rational(value) {
  if(typeof value!=='string' || value.length>128 || !/^-?\d+(?:\/[1-9]\d*)?$/.test(value)) throw new TypeError('Invalid exact layout rational');
  const [n,d='1']=value.split('/');return {n:BigInt(n),d:BigInt(d)};
}
export function numeral(value) {
  const {n,d}=rational(value),integer=n<0n ? `(- ${-n})` : String(n);
  return d===1n ? integer : `(/ ${integer} ${d})`;
}
export function affine(expr) {
  const terms=[];
  for(const [coefficient,name] of [[expr.coefficient,'width'],[expr.heightCoefficient ?? '0','height']]) {
    const value=rational(coefficient);
    if(value.n) terms.push(value.n===value.d ? name : `(* ${numeral(coefficient)} ${name})`);
  }
  if(rational(expr.constant).n) terms.push(numeral(expr.constant));
  return !terms.length ? '0' : terms.length===1 ? terms[0] : `(+ ${terms.join(' ')})`;
}
export const and=terms=>terms.length ? `(and ${terms.join(' ')})` : 'true';
export const or=terms=>terms.length ? `(or ${terms.join(' ')})` : 'false';
export function interval(range,variable) {
  if(!range || typeof range.minInclusive!=='boolean' || typeof range.maxInclusive!=='boolean') throw new TypeError('Invalid layout interval');
  return [`(${range.minInclusive ? '>=' : '>'} ${variable} ${numeral(range.minExact)})`,`(${range.maxInclusive ? '<=' : '<'} ${variable} ${numeral(range.maxExact)})`];
}
export function region(row) {
  const terms=interval(row.range,'width');
  if(row.heightRange) terms.push(...interval(row.heightRange,'height'));
  if(row.region) for(const constraint of row.region.constraints) {
    if(typeof constraint.strict!=='boolean') throw new TypeError('Invalid strict layout constraint');
    terms.push(`(${constraint.strict ? '>' : '>='} ${affine(constraint)} 0)`);
  }
  return and([...new Set(terms)]);
}
