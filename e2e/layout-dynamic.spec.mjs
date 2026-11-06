import {test,expect,chromium} from '@playwright/test';
import {build} from 'vite';
import {mkdir,writeFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {compile,requireIR} from '../lib/compiler.mjs';
import {prepareProgram} from '../lib/codegen.mjs';
import {analyzeLayout} from '../lib/layout.mjs';
const output=await build({configFile:'examples/responsive-dynamic/vite.config.mjs',logLevel:'silent',build:{write:false}});
const files=new Map(output.output.map(file=>[file.fileName,file.type==='chunk' ? file.code : String(file.source)]));
const certificate=JSON.parse(files.get('isle.layout.json'));
const rational=text=>{const[n,d=1]=text.split('/').map(Number);return n/d;};
const at=(value,w,h)=>rational(value.coefficient)*w+rational(value.heightCoefficient ?? '0')*h+rational(value.constant);
const inRange=(r,n)=>n>=r.min && n<=r.max && (n!==r.min || r.minInclusive) && (n!==r.max || r.maxInclusive);

test('all list lengths and finite classes fit with native overlay and classic scrollbars',async()=>{
  const samples=[],initial=[],errors=[];
  await mkdir('.responsive-checked/screenshots',{recursive:true});
  for(const profile of ['overlay','classic']) {
    const browser=await chromium.launch({headless:true,ignoreDefaultArgs:['--hide-scrollbars'],args:[`${profile==='classic' ? '--disable-features' : '--enable-features'}=OverlayScrollbar,OverlayScrollbars,FluentOverlayScrollbar`]});
    try {
      const page=await browser.newPage();
      page.on('pageerror',error=>errors.push(error.message));
      await page.route('https://dynamic.test/**',route=>{
        const path=new URL(route.request().url()).pathname.slice(1) || 'index.html';
        return route.fulfill({status:files.has(path) ? 200 : 404,contentType:path.endsWith('.html') ? 'text/html' : path.endsWith('.js') ? 'text/javascript' : 'application/json',body:files.get(path) ?? ''});
      });
      await page.addInitScript(()=>{window.shifts=[];new PerformanceObserver(list=>window.shifts.push(...list.getEntries().map(e=>e.value))).observe({type:'layout-shift',buffered:true});});
      for(const width of [320,375,640,1280]) for(const height of [360,600,900]) {
        await page.setViewportSize({width,height});await page.goto('https://dynamic.test/');
        await page.waitForFunction(()=>performance.getEntriesByName('first-contentful-paint').length);
        await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
        const shifts=await page.evaluate(()=>window.shifts);expect(shifts).toEqual([]);initial.push({profile,width,height,shifts});
        await page.getByRole('button',{name:'Clear',exact:true}).click();
        for(let count=0;count<=4;count++) {
          if(count) {await page.getByRole('button',{name:'Add',exact:true}).press('Enter');await expect(page.locator('.tile')).toHaveCount(count);}
          for(const compact of [false,true]) {
            if(compact) await page.getByRole('button',{name:'Style',exact:true}).click();
            await expect(page.locator('.tile.compact')).toHaveCount(compact ? count : 0);
            await expect(page.getByRole('button',{name:'Style',exact:true})).toHaveAttribute('aria-pressed',String(compact));
            await expect(page.locator('.note')).toHaveText(count ? 'Scroll to see every card.' : 'Add up to four cards.');
            const variants=certificate.report.structure.variants.filter(v=>v.choices.some(c=>c.kind==='repeat' && c.count===count) && (!count || v.choices.some(c=>c.kind==='state' && c.name==='compact' && c.value===compact))).map(v=>v.id);
            const geometry=await page.evaluate(()=>{
              const rect=node=>{const r=node.getBoundingClientRect();return{width:r.width,height:r.height};};
              const scroller=document.querySelector('.scroller'),css=getComputedStyle(scroller);
              return{boxes:Object.fromEntries(['html','body','.board','.title','.controls','.action','.scroller','.tile','.tile.compact','.empty','.note'].map(selector=>[selector,[...document.querySelectorAll(selector)].map(rect)])),
                gutter:scroller.offsetWidth-scroller.clientWidth-parseFloat(css.borderLeftWidth)-parseFloat(css.borderRightWidth),
                scrollHeight:scroller.scrollHeight,clientHeight:scroller.clientHeight,overflowX:scroller.scrollWidth>scroller.clientWidth,
                pageOverflow:document.documentElement.scrollWidth>innerWidth || document.documentElement.scrollHeight>innerHeight};
            });
            expect(geometry.gutter).toBe(profile==='classic' ? 15 : 0);
            for(const selector of ['html','body','.board','.title','.controls','.action','.scroller',compact ? '.tile.compact' : '.tile','.empty','.note']) {
              const rows=certificate.report.sizes.filter(row=>variants.includes(row.variant) && row.scrollbarProfile===profile && inRange(row.range,width) && inRange(row.heightRange,height) && (row.box===selector || selector==='html' && row.box.startsWith('html@') || selector==='body' && row.box.startsWith('body@')));
              for(const box of geometry.boxes[selector]) expect(rows.some(row=>Math.abs(box.width-at(row.inlineSize,width,height))<.04 && Math.abs(box.height-at(row.blockSize,width,height))<.04),`${profile}/${width}/${height}/${count}/${compact}/${selector}`).toBe(true);
            }
            expect(geometry.pageOverflow).toBe(false);expect(geometry.overflowX).toBe(false);
            samples.push({profile,width,height,count,compact,...geometry});
            if([0,4].includes(count) && compact && height===360 && [375,1280].includes(width)) await page.screenshot({path:`.responsive-checked/screenshots/dynamic-${profile}-${width}-${count}.png`,fullPage:true});
            if(compact) await page.getByRole('button',{name:'Style',exact:true}).click();
          }
        }
        await page.getByRole('button',{name:'Add',exact:true}).click();await expect(page.locator('.tile')).toHaveCount(4);
        if(height===360) {await page.locator('.scroller').focus();await page.keyboard.press('End');await expect.poll(()=>page.locator('.scroller').evaluate(node=>node.scrollTop)).toBeGreaterThan(0);}
      }
    } finally {await browser.close();}
  }
  expect(errors).toEqual([]);
  await mkdir('evals/results/layout-dynamic',{recursive:true});
  await writeFile('evals/results/layout-dynamic/full.json.gz',gzipSync(JSON.stringify({certificate,samples,initial,errors})));
  await writeFile('evals/results/layout-dynamic/latest.json',JSON.stringify({status:certificate.status,variants:certificate.report.structure.variants.length,bounds:certificate.report.structure.bounds,profiles:certificate.contracts.scrollbars,sampleCount:samples.length,initial,errors,
    scriptBytes:output.output.filter(f=>f.type==='chunk').reduce((n,f)=>n+Buffer.byteLength(f.code),0)},null,2)+'\n');
});

test('classic root gutters are applied to the viewport once, and explicit html overflow localizes body scrolling',async()=>{
  const browser=await chromium.launch({ignoreDefaultArgs:['--hide-scrollbars'],args:['--disable-features=OverlayScrollbar,OverlayScrollbars,FluentOverlayScrollbar']});
  try {
    const page=await browser.newPage({viewport:{width:320,height:240}});
    const ir=requireIR(compile('component C(){<main class="panel"><div class="cell"></div></main>}'));
    const content=prepareProgram(ir).render('C',{}, {mode:'ssr'}).html;
    const element=(tag,children)=>({kind:'element',tag,attributes:[],handlers:[],children});
    const doc={...ir,components:[{...ir.components[0],root:element('html',[element('body',[ir.components[0].root])])}]};
    const shell='*{box-sizing:border-box;margin:0;padding:0}html,body{display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(0,1fr);width:100%;height:100%}.panel{display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:40px}.cell{min-width:40px}';
    for(const mode of ['root','both-edges','local-body']) {
      const css=shell+(mode==='local-body' ? 'html{overflow:hidden}body{overflow:auto}.panel{height:1000px}' : `html{overflow-y:scroll;scrollbar-gutter:${mode==='both-edges' ? 'stable both-edges' : 'stable'}}body{height:1000px}`);
      await page.setContent(`<!doctype html><html><head><style>${css}</style></head><body>${content}</body></html>`);
      const boxes=await page.evaluate(()=>Object.fromEntries(['html','body','.panel'].map(s=>{const r=document.querySelector(s).getBoundingClientRect();return[s,{width:r.width,height:r.height}];})));
      expect(boxes.html.width).toBe(mode==='local-body' ? 320 : mode==='both-edges' ? 290 : 305);
      const report=analyzeLayout(doc,{component:'C',css,viewport:{min:320,max:320,height:{min:240,max:240}},scrollbars:[{name:'classic',inlineSize:15,blockSize:15}],boxes:{[mode==='local-body' ? 'body':'html']:{overflowBlock:'scroll'}}});
      expect(report.status,JSON.stringify(report.diagnostics)).toBe('verified');
      for(const [selector,box] of Object.entries(boxes)) {
        const rows=report.sizes.filter(row=>row.box===selector || row.box.startsWith(selector+'@'));
        expect(rows.some(row=>Math.abs(at(row.inlineSize,320,240)-box.width)<.04 && Math.abs(at(row.blockSize,320,240)-box.height)<.04),`${mode}/${selector}`).toBe(true);
      }
    }
  } finally {await browser.close();}
});

test('container-query thresholds follow native scrollbar-reduced content widths',async()=>{
  const ir=requireIR(compile('component C(){<main class="scroll"><div class="cell"></div></main>}'));
  const html=prepareProgram(ir).render('C',{}, {mode:'ssr'}).html;
  const css='*{margin:0;box-sizing:border-box}.scroll{display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:300px;height:100px;overflow:auto;scrollbar-gutter:stable;container:Panel / inline-size}.cell{min-width:0}@container Panel (width >= 100px){.cell{min-width:110px}}';
  for(const name of ['overlay','classic']) {
    const browser=await chromium.launch({ignoreDefaultArgs:['--hide-scrollbars'],args:[`${name==='classic' ? '--disable-features' : '--enable-features'}=OverlayScrollbar,OverlayScrollbars,FluentOverlayScrollbar`]});
    try {
      const page=await browser.newPage();
      const report=analyzeLayout(ir,{css,viewport:{min:100,max:200,height:{min:240,max:240}},scrollbars:[{name,inlineSize:name==='classic' ? 15:0,blockSize:name==='classic' ? 15:0}],boxes:{'.scroll':{overflowBlock:'scroll'}}});
      for(const width of [100,109,110,114,115,124,125,140]) {
        await page.setViewportSize({width,height:240});await page.setContent(`<!doctype html><style>${css}</style>${html}`);
        const actual=await page.locator('.scroll').evaluate(node=>({content:node.clientWidth,child:node.firstElementChild.getBoundingClientRect().width}));
        expect(actual.content).toBe(width-(name==='classic' ? 15:0));
        const predicted=report.diagnostics.some(d=>d.code==='E_LAYOUT_ITEM_SIZE' && inRange(d.range,width));
        expect(actual.child>actual.content+.04,`${name}/${width}`).toBe(predicted);
      }
    } finally {await browser.close();}
  }
});
