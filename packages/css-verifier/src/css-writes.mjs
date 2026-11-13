import {ident} from 'css-tree/utils';

// Compile-only policy metadata, independent of value parsing and layout solving.
// Reset-only members must be explicit: a shorthand grammar alone omits them.
const shorthands=new Map();
const define=(name,members)=>shorthands.set(name,members.split(' '));
const sides=['top','right','bottom','left'];
for(const family of ['padding','margin','inset','scroll-padding','scroll-margin']) {
  define(family,sides.map(side=>family==='inset' ? side : `${family}-${side}`).join(' '));
  for(const axis of ['inline','block']) define(`${family}-${axis}`,`${family}-${axis}-start ${family}-${axis}-end`);
}
for(const field of ['width','style','color']) define(`border-${field}`,sides.map(side=>`border-${side}-${field}`).join(' '));
for(const side of [...sides,'inline-start','inline-end','block-start','block-end'])
  define(`border-${side}`,['width','style','color'].map(field=>`border-${side}-${field}`).join(' '));
for(const axis of ['inline','block']) {
  define(`border-${axis}`,`border-${axis}-start border-${axis}-end`);
  for(const field of ['width','style','color']) define(`border-${axis}-${field}`,`border-${axis}-start-${field} border-${axis}-end-${field}`);
}
define('border-image','border-image-source border-image-slice border-image-width border-image-outset border-image-repeat');
define('border','border-width border-style border-color border-image');
define('border-radius','border-top-left-radius border-top-right-radius border-bottom-right-radius border-bottom-left-radius');
define('gap','row-gap column-gap');
define('overflow','overflow-x overflow-y');
define('container','container-name container-type');
define('outline','outline-color outline-style outline-width');
define('background-position','background-position-x background-position-y');
define('background-repeat','background-repeat-x background-repeat-y');
define('background','background-color background-image background-position background-size background-repeat background-origin background-clip background-attachment');
define('font-variant','font-variant-ligatures font-variant-caps font-variant-alternates font-variant-numeric font-variant-east-asian font-variant-position font-variant-emoji');
define('font','font-style font-variant font-weight font-width font-size line-height font-family font-feature-settings font-kerning font-language-override font-optical-sizing font-size-adjust font-variation-settings');
define('font-synthesis','font-synthesis-weight font-synthesis-style font-synthesis-small-caps font-synthesis-position');
define('grid-template','grid-template-rows grid-template-columns grid-template-areas');
define('grid','grid-template grid-auto-rows grid-auto-columns grid-auto-flow');
define('grid-column','grid-column-start grid-column-end');
define('grid-row','grid-row-start grid-row-end');
define('grid-area','grid-row grid-column');
for(const target of ['items','self','content']) define(`place-${target}`,`align-${target} justify-${target}`);
define('flex','flex-grow flex-shrink flex-basis');
define('flex-flow','flex-direction flex-wrap');
define('columns','column-width column-count');
define('column-rule','column-rule-width column-rule-style column-rule-color');
define('list-style','list-style-type list-style-position list-style-image');
define('text-decoration','text-decoration-line text-decoration-style text-decoration-color text-decoration-thickness');
define('text-emphasis','text-emphasis-style text-emphasis-color');
define('transition','transition-property transition-duration transition-timing-function transition-delay transition-behavior');
define('animation-range','animation-range-start animation-range-end');
define('animation','animation-name animation-duration animation-timing-function animation-delay animation-iteration-count animation-direction animation-fill-mode animation-play-state animation-timeline animation-range');

const aliases=new Map([['font-stretch','font-width'],['grid-gap','gap'],['grid-row-gap','row-gap'],['grid-column-gap','column-gap'],['word-wrap','overflow-wrap']]);
function normalize(property) {
  const decoded=ident.decode(property);
  if(decoded.startsWith('--')) return decoded;
  const lower=decoded.toLowerCase();
  return aliases.get(lower)??lower;
}
const expand=property=>shorthands.has(property) ? shorthands.get(property).flatMap(expand) : [property];
// All distinct side mappings of horizontal/vertical/sideways modes and directions.
// Compare each environment separately so inline and block remain disjoint.
const orientations=[
  ['left','right','top','bottom'],['right','left','top','bottom'],
  ['top','bottom','right','left'],['bottom','top','right','left'],
  ['top','bottom','left','right'],['bottom','top','left','right'],
];
function physical(property,mapping) {
  const side=token=>mapping[['inline-start','inline-end','block-start','block-end'].indexOf(token)];
  if(/^inset-(inline|block)-(start|end)$/.test(property)) return side(property.slice(6));
  if(/^border-(start|end)-(start|end)-radius$/.test(property)) {
    const [,block,inline]=property.split('-'),pair=[side(`block-${block}`),side(`inline-${inline}`)];
    return `border-${pair.find(p=>p==='top'||p==='bottom')}-${pair.find(p=>p==='left'||p==='right')}-radius`;
  }
  return property.replace(/^(padding|margin|scroll-padding|scroll-margin|border)-(inline|block)-(start|end)(?=-|$)/,
    (_,family,axis,end)=>`${family}-${side(`${axis}-${end}`)}`);
}
const resettable=property=>!property.startsWith('--') && !['direction','unicode-bidi'].includes(property);
const hint='Use non-overlapping longhands, or put an intentional override in a separate rule.';

/** At most one diagnostic per later declaration; repeated identical properties are CSS fallbacks. */
export function findCSSWriteConflicts(properties) {
  const entries=properties.map((raw,index)=>{
    const property=normalize(raw);
    return {index,property,shorthand:property==='all'||shorthands.has(property),
      writes:orientations.map(mapping=>new Set(expand(property).map(p=>physical(p,mapping))))};
  });
  const indices=orientations.map(()=>new Map()),previous=[],all=[],conflicts=[];
  for(const entry of entries) {
    let earlier;
    const consider=prior=>{
      if(prior.property!==entry.property && (prior.shorthand||entry.shorthand) && (!earlier||prior.index<earlier.index)) earlier=prior;
    };
    if(entry.property==='all') {
      for(const prior of previous) if(resettable(prior.property)) consider(prior);
    } else if(resettable(entry.property)) {
      all.forEach(consider);
      entry.writes.forEach((writes,mode)=>{
        for(const name of writes) for(const prior of indices[mode].get(name)?.values()??[]) consider(prior);
      });
    }
    if(earlier) {
      const longhands=new Set();
      entry.writes.forEach((writes,mode)=>{
        const before=earlier.writes[mode];
        for(const name of entry.property==='all' ? before : writes)
          if(entry.property==='all'||earlier.property==='all'||before.has(name)) longhands.add(name);
      });
      conflicts.push({earlier:earlier.index,later:entry.index,properties:[properties[earlier.index],properties[entry.index]],longhands:[...longhands].sort(),hint});
    }
    previous.push(entry);
    if(entry.property==='all') {all.push(entry);continue;}
    if(entry.property.startsWith('--')) continue;
    entry.writes.forEach((writes,mode)=>{
      for(const name of writes) {
        if(!indices[mode].has(name)) indices[mode].set(name,new Map());
        // The earliest occurrence is enough to point to a conflicting declaration.
        if(!indices[mode].get(name).has(entry.property)) indices[mode].get(name).set(entry.property,entry);
      }
    });
  }
  return conflicts;
}

export function cssWriteConflictMessage(conflict) {
  return `${conflict.properties[1]} and ${conflict.properties[0]} may both write ${conflict.longhands.join(', ')} in the same CSS rule`;
}
