const plain='<main class="page"><div class="content"></div><div class="action"></div></main>';
const reserved='<main class="page"><div class="slot"><div class="content"></div></div><div class="action"></div></main>';
const reset='html,body{margin:0;padding:0}*{box-sizing:border-box}';
const base=reset+'.page{display:grid;grid-template-columns:minmax(0,1fr);gap:8px}.action{height:32px}';
const endpoint=(height,extra='')=>base+`.content{height:${height}px}`+extra;
const reserve='.slot{height:80px;display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(0,1fr)}';
const fixed='.page{height:120px;align-content:start}';
const nested='<main class="page"><div class="content"><div class="pin"></div></div></main>';
const absolute='.page{padding:10px;border:2px solid black}.content{height:100px;position:relative;display:grid;padding:4px;border:3px solid black}.pin{position:absolute;left:5px;top:7px;width:20px;height:20px}';

export const scenarios=[
  {name:'unreserved',html:plain,before:endpoint(24),after:endpoint(80),status:'violated'},
  {name:'reserved',html:reserved,before:endpoint(24,reserve),after:endpoint(80,reserve),status:'verified'},
  {name:'fixed-frame-only',html:plain,before:endpoint(24,fixed),after:endpoint(80,fixed),path:'Page',selector:'.page',status:'verified'},
  {name:'fixed-frame-moving-child',html:plain,before:endpoint(24,fixed),after:endpoint(80,fixed),status:'violated'},
  {name:'fractional-responsive',html:plain,before:endpoint(24),after:endpoint(24,'@media(width >= 600px) and (width < 600.5px){.content{height:24.25px}}'),status:'violated'},
  {name:'target-disappears',html:plain,before:endpoint(24),after:endpoint(24,'.action{display:none}'),status:'violated'},
  {name:'absolute-padding-origin',html:nested,before:endpoint(24,absolute),after:endpoint(24,absolute.replace('left:5px','left:6px')),path:'Page/0/0',selector:'.pin',status:'violated'},
  {name:'unknown-transform',html:plain,before:endpoint(24),after:endpoint(24,'.action{transform:translateY(1px)}'),status:'unknown'},
  {name:'unknown-scroll-frame',html:plain,before:endpoint(24),after:endpoint(24,'.page{overflow:hidden}'),status:'unknown'},
];
