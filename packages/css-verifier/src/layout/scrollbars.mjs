const zero={inlineSize:0,blockSize:0};
export function scrollbarFrames(style,profile,viewport=false) {
  const gutter=style['scrollbar-gutter'],width=style['scrollbar-width'];
  if (!['auto','stable','stable both-edges','both-edges stable'].includes(gutter) || !['auto','thin','none'].includes(width)) throw new Error('Unsupported scrollbar geometry');
  if (width==='none') return [zero];
  const stable=gutter!=='auto',factor=gutter.includes('both-edges') ? 2 : 1;
  let x=style['overflow-x'],y=style['overflow-y'];
  if (viewport && x==='visible' && y==='visible' && !stable) return [zero];
  if (viewport) { if(x==='visible') x='auto';if(y==='visible') y='auto';if(x==='clip') x='hidden';if(y==='clip') y='hidden'; }
  const needs=['auto','scroll'].includes(x) || ['auto','scroll'].includes(y) || stable && y==='hidden';
  if (!needs) return [zero];
  if (!profile) throw Object.assign(new Error('Native scrollbar metrics are required; declare scrollbar profiles'),{code:'U_LAYOUT_SCROLLBAR'});
  const inlineSize=width==='thin' ? profile.thinInlineSize : profile.inlineSize;
  const blockSize=width==='thin' ? profile.thinBlockSize : profile.blockSize;
  if (inlineSize===undefined || blockSize===undefined) throw Object.assign(new Error('Thin scrollbar metrics are missing from the declared profile'),{code:'U_LAYOUT_SCROLLBAR'});
  const inline=y==='scroll' || stable && ['auto','hidden'].includes(y) ? [inlineSize*factor] : y==='auto' ? [0,inlineSize] : [0];
  const block=x==='scroll' ? [blockSize] : x==='auto' ? [0,blockSize] : [0];
  return [...new Map(inline.flatMap(inlineSize=>block.map(blockSize=>[`${inlineSize}/${blockSize}`,{inlineSize,blockSize}]))).values()];
}
