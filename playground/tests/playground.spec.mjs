import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
const preview=page=>page.frameLocator('#preview');
test('warnings remain visible on successful compilation and navigate to the unused declaration',async({page})=>{
  await page.goto('/');await expect(page.getByRole('status')).toContainText('Ready');
  await page.locator('#auto').uncheck();await page.locator('#props').fill('{}');
  const source='client component C(){\n state count=0;\n event idle(e:EventSnapshot<MouseEvent>){count+=1;}\n <button type="button" on:click={idle}>Idle</button>\n}';
  await page.locator('#source').fill(source);await page.locator('#compile').click();
  await expect(page.getByRole('status')).toContainText('Ready');
  await expect(page.locator('#diagnostics')).toContainText('warning · W_UNOBSERVED_VALUE');
  await expect(page.locator('#diagnostics')).toContainText('W_UNOBSERVED_EVENT');
  await expect(preview(page).getByRole('button',{name:'Idle'})).toBeVisible();
  await expect(preview(page).locator('[data-isle-snapshot]')).toHaveCount(0);
  await page.locator('#diagnostics button').filter({hasText:'W_UNOBSERVED_VALUE'}).click();
  expect(await page.locator('#source').evaluate(el=>el.value.slice(el.selectionStart,el.selectionEnd))).toBe('count');
  for(const width of [390,1440]) {
    await page.setViewportSize({width,height:960});
    await page.screenshot({path:test.info().outputPath(`warnings-${width}.png`),fullPage:true});
  }
  await page.locator('#source').fill(source.replace('>Idle</button>','>{count}</button>'));await page.locator('#compile').click();
  await expect(page.locator('#diagnostics')).toBeHidden();
  await expect(preview(page).getByRole('button',{name:'0',exact:true})).toBeVisible();
  await preview(page).getByRole('button',{name:'0',exact:true}).click();
  await expect(preview(page).getByRole('button',{name:'1',exact:true})).toBeVisible();
});
test('shorthand conflicts point to both declarations and explicit overrides remain native CSS',async({page})=>{
  const requests=[];page.on('request',request=>requests.push(request.url()));
  await page.goto('/');await expect(page.getByRole('status')).toContainText('Ready');
  await page.locator('#props').fill('{}');
  const source='component C(){<main class="box"><style>\n.box {\n  font-weight:700;\n  font:16px sans-serif;\n}\n</style>Text</main>}';
  await page.locator('#source').fill(source);
  await expect(page.locator('#diagnostics')).toContainText('E_CSS_SHORTHAND_CONFLICT');
  await expect(page.locator('#diagnostics')).toContainText('4:3');
  await expect(page.locator('#diagnostics')).toContainText('Earlier declaration at 3:3');
  await page.locator('#diagnostics button').click();
  expect(await page.locator('#source').evaluate(el=>el.value.slice(el.selectionStart,el.selectionEnd))).toBe('font:16px sans-serif');
  await page.locator('#source').fill('component C(){<main class="box"><style>.box{font:16px sans-serif}.box{font-weight:700}</style>Text</main>}');
  await expect(page.getByRole('status')).toContainText('Ready');
  await expect(preview(page).locator('.box')).toHaveCSS('font-weight','700');
  expect(requests.filter(url=>url.endsWith('.wasm'))).toEqual([]);
});
test('source layout declarations run mandatory checks and reject invalid actual allocations',async({page})=>{
  await page.goto('/');await page.locator('#preset').selectOption('layoutDeclared');
  await expect(page.locator('#layout-status')).toContainText('Verified',{timeout:30000});
  await expect(page.locator('#verify-layout')).toBeChecked();await expect(page.locator('#verify-layout')).toBeDisabled();
  await expect(preview(page).locator('.cell')).toHaveCount(4);
  const source=await page.locator('#source').inputValue();
  await page.locator('#output-kind').selectOption('layout');
  await expect(page.locator('#output')).toContainText('"declarations"');
  await page.locator('#source').fill(source.replace('repeat(4,','repeat(1,'));
  await page.locator('#layout').fill('{"viewport":{"min":120,"max":640,"height":{"min":160,"max":640}}}');
  await expect(page.locator('#layout-status')).toContainText('Violated');
  await expect(page.locator('#layout-status')).toContainText('E_LAYOUT_CHILD_REQUIRES');
  await page.locator('#output-kind').selectOption('smt');
  await expect(page.locator('#output')).toContainText('Declared Four');
  await page.locator('#source').fill(source);await page.locator('#layout').fill('{}');
  await expect(page.locator('#layout-status')).toContainText('Verified');
  await page.locator('#source').fill(source.replace('SafeGrid','AnyCSS'));
  await expect(page.locator('#diagnostics')).toContainText('E_LAYOUT_PROFILE');
  await page.locator('#source').fill(source.replace(/  layout SafeGrid \{[\s\S]*?\n  \}\n/,''));
  await expect(page.locator('#verify-layout')).toBeEnabled();
  await page.locator('#verify-layout').uncheck();
  await expect(page.locator('#layout-status')).toContainText('not checked');
});
test('CSS variables reach Z3 Wasm with inherited values, cycle diagnostics and fallback recovery',async({page})=>{
  await page.goto('/');await page.locator('#preset').selectOption('layoutVariables');
  await expect(page.locator('#layout-status')).toContainText('Verified',{timeout:30000});
  await expect(page.locator('#layout-status')).toContainText('UNSAT');
  await expect(preview(page).locator('.cell')).toHaveCount(4);
  const source=await page.locator('#source').inputValue();
  await page.locator('#source').fill(source.replace('--cell: 40px','--cell: 41px'));
  await expect(page.locator('#layout-status')).toContainText('Violated');
  await page.locator('#source').fill(source.replace('--cell: 40px','--cell: var(--cell)'));
  await expect(page.locator('#layout-status')).toContainText('Unknown');
  await expect(page.locator('#layout-status')).toContainText('cycle');
  await page.locator('#source').fill(source.replace('--cell: 40px','--cell: var(--cell)').replace('min-width: var(--cell)','min-width: var(--cell, 40px)'));
  await expect(page.locator('#layout-status')).toContainText('Verified');
});

test('source noshift verifies finite states in browser Z3 and flags moving targets',async({page})=>{
  await page.goto('/');await expect(page.getByRole('status')).toContainText('Ready');await page.locator('#preset').selectOption('layoutNoShift');
  await expect(page.locator('#layout-status')).toContainText('Verified',{timeout:30000});
  await expect(page.locator('#verify-layout')).toBeDisabled();
  await page.locator('#output-kind').selectOption('layout');
  await expect(page.locator('#output')).toContainText('"noshift"');
  await expect(page.locator('#output')).toContainText('"planned": 2');
  for(const width of [390,1440]) {
    await page.setViewportSize({width,height:960});
    await page.locator('#preview').scrollIntoViewIfNeeded();
    await preview(page).getByRole('button',{name:'Toggle panel'}).scrollIntoViewIfNeeded();
    await expect(preview(page).getByRole('button',{name:'Toggle panel'})).toBeVisible();
    await page.screenshot({path:test.info().outputPath(`noshift-verified-${width}.png`),fullPage:true});
  }
  const action=preview(page).getByRole('button',{name:'Toggle panel'});
  const before=await action.boundingBox();await action.click();
  await expect(preview(page).locator('.content')).toHaveClass(/expanded/);
  const after=await action.boundingBox();expect(after.y).toBe(before.y);
  const source=await page.locator('#source').inputValue();
  await page.locator('#source').fill(source.replace('height:80px;display:grid','display:grid'));
  await expect(page.locator('#layout-status')).toContainText('Violated',{timeout:30000});
  await expect(page.locator('#layout-status')).toContainText('E_NOSHIFT_BLOCK_START');
  await page.screenshot({path:test.info().outputPath('noshift-violated.png'),fullPage:true});
  await page.locator('#output-kind').selectOption('smt');
  await expect(page.locator('#output')).toContainText('Noshift Panel');
  await page.locator('#source').fill(source.replace('noshift ".action"','noshift ".missing"'));
  await expect(page.locator('#layout-status')).toContainText('Unknown');
  await expect(page.locator('#layout-status')).toContainText('needs exactly one');
  await page.screenshot({path:test.info().outputPath('noshift-unknown.png'),fullPage:true});
});

test('keyed noshift follows resumed row identity and detects movement after reorder',async({page})=>{
  await page.goto('/');await expect(page.getByRole('status')).toContainText('Ready');
  await page.locator('#preset').selectOption('layoutNoShiftKeys');
  await expect(page.locator('#layout-status')).toContainText('Verified',{timeout:30000});
  await page.locator('#output-kind').selectOption('layout');
  await expect(page.locator('#output')).toContainText('"identities"');
  const source=await page.locator('#source').inputValue(),rows=preview(page).locator('.list > div');
  const first=await rows.first().elementHandle(),before=await first.boundingBox();
  await preview(page).getByRole('button',{name:'Reorder rows'}).click();
  await expect(rows.first()).toHaveAttribute('data-id','b');
  expect(await rows.last().evaluate((node,original)=>node===original,first)).toBe(true);
  expect((await first.boundingBox()).y).toBe(before.y);
  for(const width of [390,1440]) {
    await page.setViewportSize({width,height:960});
    await page.locator('#preview').scrollIntoViewIfNeeded();
    await preview(page).getByRole('button',{name:'Reorder rows'}).scrollIntoViewIfNeeded();
    await page.screenshot({path:test.info().outputPath(`noshift-keys-${width}.png`),fullPage:true});
  }
  const moving=source.replace('grid-column:1;grid-row:1;','').replace('grid-column:1;grid-row:2;','');
  await page.locator('#source').fill(moving);
  await expect(page.locator('#layout-status')).toContainText('Violated',{timeout:30000});
  await expect(page.locator('#layout-status')).toContainText('E_NOSHIFT_BLOCK_START');
  const row=await preview(page).locator('[data-id="a"]').elementHandle(),start=await row.boundingBox();
  await preview(page).getByRole('button',{name:'Reorder rows'}).click();
  await expect(rows.first()).toHaveAttribute('data-id','b');
  expect((await row.boundingBox()).y-start.y).toBe(40);
  await page.screenshot({path:test.info().outputPath('noshift-keys-violated.png'),fullPage:true});
});

test('DOM noshift requirements survive class changes and cannot be disabled by CSS',async({page})=>{
  await page.goto('/');await expect(page.getByRole('status')).toContainText('Ready');
  await page.locator('#preset').selectOption('layoutNoShiftDOM');
  await expect(page.locator('#layout-status')).toContainText('Verified',{timeout:30000});
  await expect(page.locator('#verify-layout')).toBeDisabled();
  await expect(page.locator('#source').locator('..').locator('.syntax-token--attribute').filter({hasText:'@noshift'})).toHaveText('@noshift');
  const source=await page.locator('#source').inputValue();
  await page.locator('#output-kind').selectOption('layout');
  await expect(page.locator('#output')).toContainText('"nodeId": "Panel.noshift.0"');
  await page.locator('#source').fill(source.replace('class="action"','class={expanded ? "action active" : "action"}'));
  await expect(page.locator('#layout-status')).toContainText('Verified');
  const action=preview(page).getByRole('button',{name:'Toggle panel'});
  await action.click();await expect(action).toHaveClass(/active/);
  await page.locator('#source').evaluate(input=>{input.scrollTop=input.scrollHeight;});
  for(const width of [390,1440]) {
    await page.setViewportSize({width,height:960});await page.locator('#preview').scrollIntoViewIfNeeded();
    await expect(action).toBeVisible();await page.screenshot({path:test.info().outputPath(`noshift-dom-${width}.png`),fullPage:true});
  }
  await page.locator('#source').fill(source.replace('height:80px;display:grid','display:grid'));
  await expect(page.locator('#layout-status')).toContainText('E_NOSHIFT_BLOCK_START');
  await page.locator('#source').fill(source.replace('</style>','.action{display:none}</style>'));
  await expect(page.locator('#layout-status')).toContainText('E_NOSHIFT_PRESENCE');
  await page.locator('#source').fill(source.replace('@noshift','@noshift={false}'));
  await expect(page.locator('#diagnostics')).toContainText('E_LAYOUT_ANNOTATION');
});
test('named absolute spaces use padding-box coordinates and validate in Z3 Wasm',async({page})=>{
  await page.goto('/');await page.locator('#preset').selectOption('layoutPositioned');
  await expect(page.locator('#layout-status')).toContainText('Verified',{timeout:30000});
  const source=await page.locator('#source').inputValue();
  for(const width of [320,641,960]) {
    await page.locator('#preview').evaluate((frame,width)=>{frame.style.width=`${width}px`;},width);
    const coordinates=await preview(page).locator('.controls').evaluate(control=>{
      const map=document.querySelector('.map'),p=map.getBoundingClientRect(),c=control.getBoundingClientRect();
      return {x:c.left-p.left-map.clientLeft,y:c.top-p.top-map.clientTop,width:p.width};
    });
    expect(Math.abs(coordinates.x-(coordinates.width-60))).toBeLessThan(.03);
    expect(coordinates.y).toBe(180);
  }
  await page.locator('#source').fill(source.replace('inset-inline-end: 16px','inset-inline-end: -8px'));
  await expect(page.locator('#layout-status')).toContainText('Violated');
  await expect(page.locator('#layout-status')).toContainText('E_LAYOUT_ABSOLUTE_END');
  await page.locator('#source').fill(source.replace('space map = ".map"','space map = ".surface"'));
  await expect(page.locator('#layout-status')).toContainText('Violated');
  await page.locator('#source').fill(source.replace('position: relative','position: relative; transform: translateX(1px)'));
  await expect(page.locator('#layout-status')).toContainText('Unknown');
});
test('child coordinate spaces transfer allocation and keep their private overlays local',async({page})=>{
  await page.goto('/');await page.locator('#preset').selectOption('layoutPositionedComponents');
  await expect(page.locator('#layout-status')).toContainText('Verified',{timeout:30000});
  const frame=preview(page),panel=frame.locator('.map-panel');
  await expect(panel).toHaveCSS('width','160px');
  await expect(panel).toHaveCSS('height','120px');
  expect(await panel.evaluate(el=>el.parentElement.classList.contains('map'))).toBe(true);
  const geometry=await frame.locator('.panel-knob').evaluate(knob=>{
    const inner=document.querySelector('.panel-content'),p=inner.getBoundingClientRect(),c=knob.getBoundingClientRect();
    return {x:c.left-p.left-inner.clientLeft,y:c.top-p.top-inner.clientTop,owner:knob.offsetParent.classList.contains('panel-content')};
  });
  expect(geometry).toEqual({x:108,y:68,owner:true});
  const source=await page.locator('#source').inputValue();
  await page.locator('#output-kind').selectOption('layout');
  await expect(page.locator('#output')).toContainText('"placementTransfers"');
  await page.locator('#source').fill(source.replace('160px..240px','161px..240px'));
  await expect(page.locator('#layout-status')).toContainText('Violated');
  await expect(page.locator('#layout-status')).toContainText('E_LAYOUT_CHILD_REQUIRES');
  await page.locator('#source').fill(source);await expect(page.locator('#layout-status')).toContainText('Verified');
});
test('owned inline CSS stays separate across server/client components after resume',async({page})=>{
  await page.goto('/');await page.locator('#preset').selectOption('styled');
  const frame=preview(page),child=frame.locator('[data-styled-child]'),parent=frame.locator('[data-styled-parent]');
  await expect(child).toHaveCSS('color','rgb(179, 38, 30)');
  await expect(parent).toHaveCSS('color','rgb(23, 71, 166)');
  await child.click();await expect(child).toHaveText('Child 1');
  await expect(child).toHaveCSS('color','rgb(179, 38, 30)');
  await expect(parent).toHaveCSS('color','rgb(23, 71, 166)');
  await expect(page.locator('#metrics')).toContainText('1 restored');
  await page.locator('#output-kind').selectOption('styles');
  await expect(page.locator('#output')).toContainText(':is(button).i_');
});
test('inline CSS is checked by lazy Z3 Wasm, with SAT witnesses and unknowns kept distinct',async({page})=>{
  const requests=[];page.on('request',request=>requests.push(request.url()));
  await page.goto('/');await expect(page.getByRole('status')).toContainText('Ready');
  expect(requests.some(url=>url.includes('/solver/'))).toBe(false);
  await page.locator('#preset').selectOption('layout');
  await expect(page.locator('#layout-status')).toContainText('Verified',{timeout:30000});
  await expect(page.locator('#layout-status')).toContainText('UNSAT');
  expect(requests.some(url=>url.endsWith('/z3-built.wasm'))).toBe(true);
  await expect(preview(page).locator('.cell')).toHaveCount(4);
  await expect(preview(page).locator('.row')).toHaveCSS('display','grid');
  await page.locator('#layout').fill('{"viewport":{"min":120,"max":640,"height":{"min":80,"max":640}}}');
  await expect(page.locator('#layout-status')).toContainText('Violated');
  await expect(page.locator('#layout-status')).toContainText('SAT');
  await page.locator('#output-kind').selectOption('layout');
  await expect(page.locator('#output')).toContainText('viewportExact');
  await page.locator('#output-kind').selectOption('smt');
  await expect(page.locator('#output')).toContainText('(set-logic QF_LRA)');
  await page.locator('#layout').fill('{"viewport":{"min":160,"max":640,"height":{"min":20,"max":640}}}');
  await expect(page.locator('#layout-status')).toContainText('Violated');
  await page.locator('#output-kind').selectOption('layout');
  await expect(page.locator('#output')).toContainText('"axis": "block"');
  await page.locator('#preset').selectOption('layoutResponsive');
  await expect(page.locator('#layout-status')).toContainText('Verified');
  await page.locator('#source').fill((await page.locator('#source').inputValue()).replace('min-width: 40px','min-width: var(--cell-width)'));
  await expect(page.locator('#layout-status')).toContainText('Unknown');
  await page.locator('#verify-layout').uncheck();
  await expect(page.locator('#layout-status')).toContainText('not checked');
});
test('event declarations cancel synchronously before resume and expose typed snapshots',async({page})=>{
  await page.goto('/');await page.locator('#preset').selectOption('events');
  await expect(page.getByRole('status')).toContainText('Ready');
  const frame=preview(page);
  await expect(page.locator('#source')).toHaveValue(/event edit\(event: EventSnapshot<InputEvent>\)/);
  await expect(page.locator('#metrics')).toContainText('0 restored');
  const delivery=await frame.getByRole('button',{name:'Cancel default'}).evaluate(button=>{
    const event=new MouseEvent('click',{bubbles:true,cancelable:true});
    const result=button.dispatchEvent(event);
    return {result,cancelled:event.defaultPrevented,immediate:document.querySelector('[data-clicks]').textContent};
  });
  expect(delivery).toEqual({result:false,cancelled:true,immediate:'0'});
  await expect(frame.locator('[data-clicks]')).toHaveText('1');
  await frame.getByLabel('Message').fill('Explicit snapshot');
  await expect(frame.locator('[data-message]')).toHaveText('Explicit snapshot');
  await frame.getByLabel('Message').press('Enter');
  await expect(frame.locator('[data-key]')).toHaveText('Enter');
  await page.locator('#source').fill((await page.locator('#source').inputValue()).replace('clicks += 1;', 'event.preventDefault();'));
  await expect(page.locator('#diagnostics')).toContainText('E_EVENT_PHASE');
  await page.getByRole('button',{name:'Reset preset'}).click();
  await expect(page.getByRole('status')).toContainText('Ready');
  await page.locator('#mode').selectOption('ssr');
  await expect(page.getByRole('status')).toContainText('Ready');
  expect(await page.locator('#preview').getAttribute('srcdoc')).not.toMatch(/<script|data-isle-|on:click/);
});

test('new fragment rows retain event argument bindings and synchronous policies',async({page})=>{
  await page.goto('/');await page.locator('#preset').selectOption('fragments');
  await expect(page.getByRole('status')).toContainText('Ready');
  await page.locator('#source').fill((await page.locator('#source').inputValue()).replace('on:click={(event)', 'on:click.preventDefault={(event)'));
  const frame=preview(page);
  await expect(page.getByRole('status')).toContainText('Ready');
  await frame.getByRole('button',{name:'Replace first key'}).click();
  const cancelled=await frame.getByRole('button',{name:'Replacement',exact:true}).evaluate(button=>!button.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true})));
  expect(cancelled).toBe(true);await expect(frame.locator('[data-selected]')).toHaveText('c');
});
test('compiles locally, resumes on interaction, edits props and reports errors',async({page})=>{
  await page.goto('/');
  await expect(page.getByRole('status')).toContainText('Ready');
  await expect(preview(page).locator('output')).toHaveText('5 / 10');
  await expect(page.locator('#metrics')).toContainText('0 restored');
  await preview(page).getByRole('button',{name:'Increment',exact:true}).click();
  await expect(preview(page).locator('output')).toHaveText('6 / 12');
  await expect(page.locator('#metrics')).toContainText('1 restored');
  expect(await page.locator('#preview').getAttribute('sandbox')).not.toContain('allow-same-origin');
  await page.locator('#props').fill('{"initial":20}');
  await expect(preview(page).locator('output')).toHaveText('20 / 40');
  await page.locator('#source').fill('client component Broken( {');
  await expect(page.getByRole('status')).toContainText('Compile error');
  await expect(page.locator('#diagnostics')).not.toBeEmpty();
  await page.getByRole('button',{name:'Reset preset'}).click();
  await expect(page.getByRole('status')).toContainText('Ready');
});
test('keyed regions, empty and nested owner states work in generated modules',async({page})=>{
  await page.goto('/');await page.locator('#preset').selectOption('list');
  await expect(page.getByRole('status')).toContainText('Ready');
  await expect(preview(page).locator('li')).toHaveText(['First','Second']);
  await preview(page).getByRole('button',{name:'Reverse rows'}).click();
  await expect(preview(page).locator('li')).toHaveText(['Second','First']);
  await preview(page).getByRole('button',{name:'Empty list'}).click();
  await expect(preview(page).locator('li')).toHaveText(['No rows']);
  await page.locator('#preset').selectOption('nested');
  await expect(preview(page).locator('output')).toHaveText(['1','11']);
  await preview(page).getByRole('button',{name:'Increment'}).first().click();
  await expect(preview(page).locator('output')).toHaveText(['2','11']);
});
test('SSR emits no dynamic data, CSS edits work and invalid props recover',async({page})=>{
  await page.goto('/');await expect(page.getByRole('status')).toContainText('Ready');
  await page.locator('#css').fill('body { color: rgb(255, 0, 0); }');
  await expect(preview(page).locator('body')).toHaveCSS('color','rgb(255, 0, 0)');
  await page.locator('#mode').selectOption('ssr');
  await expect(page.getByRole('status')).toContainText('Ready');
  expect(await page.locator('#preview').getAttribute('srcdoc')).not.toMatch(/<script|data-isle-/);
  await page.locator('#props').fill('{');
  await expect(page.getByRole('status')).toContainText('Props error');
  await page.locator('#props').fill('{"initial":7}');
  await expect(preview(page).locator('output')).toHaveText('7 / 14');
});

test('Fragment keys own the whole group across moves, replacement and reinsertion',async({page})=>{
  await page.goto('/');await page.locator('#preset').selectOption('fragments');
  const frame=preview(page);
  await expect(frame.locator('[data-row]')).toHaveCount(2);
  await frame.locator('body').evaluate(()=>{
    window.originalA=document.querySelector('[data-row="a"]');window.originalDetailA=document.querySelector('[data-detail="a"]');
    window.originalB=document.querySelector('[data-row="b"]');window.originalDetailB=document.querySelector('[data-detail="b"]');
  });
  await frame.getByRole('button',{name:'Reverse groups'}).click();
  await expect(frame.locator('[data-row]').first()).toHaveAttribute('data-row','b');
  expect(await frame.locator('[data-row="a"]').evaluate(node=>node===window.originalA)).toBe(true);
  expect(await frame.locator('[data-detail="a"]').evaluate(node=>node===window.originalDetailA)).toBe(true);
  await frame.getByRole('button',{name:'Replace first key'}).click();
  await expect(frame.locator('[data-row]').first()).toHaveAttribute('data-row','c');
  expect(await frame.locator('body').evaluate(()=>window.originalB.isConnected || window.originalDetailB.isConnected)).toBe(false);
  expect(await frame.locator('[data-row="a"]').evaluate(node=>node===window.originalA)).toBe(true);
  await frame.getByRole('button',{name:'Replacement',exact:true}).click();await expect(frame.locator('[data-selected]')).toHaveText('c');
  await frame.getByRole('button',{name:'Clear groups'}).click();await expect(frame.locator('ul')).toHaveText('No groups');
  await frame.getByRole('button',{name:'Restore groups'}).click();await expect(frame.locator('[data-row]')).toHaveCount(2);
  expect(await frame.locator('[data-row="a"]').evaluate(node=>node===window.originalA)).toBe(false);
  expect(await page.locator('#preview').getAttribute('srcdoc')).not.toMatch(/<Fragment\b|\skey=/);
});

test('compilation stays local offline; manual run, module inspection and download work',async({page,context})=>{
  await page.goto('/');await expect(page.getByRole('status')).toContainText('Ready');
  await context.setOffline(true);
  await page.locator('#auto').uncheck();await page.locator('#props').fill('{"initial":41}');
  await expect(page.getByRole('status')).toContainText('press Compile');
  await page.locator('#source').press('Control+Enter');
  await expect(preview(page).locator('output')).toHaveText('41 / 82');
  await page.locator('#output-kind').selectOption('modules');
  await expect(page.locator('#output')).toContainText('export function');
  const download=page.waitForEvent('download');await page.locator('#download').click();
  expect((await download).suggestedFilename()).toBe('isle-preview.json');
  await context.setOffline(false);
});

test('renaming the selected component and rapid edits use the latest source',async({page})=>{
  await page.goto('/');await expect(page.getByRole('status')).toContainText('Ready');
  const source=await page.locator('#source').inputValue();
  await page.locator('#source').fill(source.replace('Counter(', 'Renamed('));
  await expect(page.getByRole('status')).toContainText('Ready');
  await expect(page.locator('#component')).toHaveValue('Renamed');
  for(const n of [101,202,303]) await page.locator('#props').fill(JSON.stringify({initial:n}));
  await expect(preview(page).locator('output')).toHaveText('303 / 606');
});

test('removed directive syntax reports a migration diagnostic and a new preset recovers',async({page})=>{
  await page.goto('/');await expect(page.getByRole('status')).toContainText('Ready');
  await page.locator('#source').fill('component Page(){<main>@if(true){<p>Legacy</p>}</main>}');
  await expect(page.getByRole('status')).toContainText('Compile error');
  await expect(page.locator('#diagnostics')).toContainText('E_CONTROL_REMOVED');
  await expect(page.locator('#diagnostics')).toContainText('Show');
  await page.locator('#preset').selectOption('list');await expect(page.getByRole('status')).toContainText('Ready');
  await expect(preview(page).locator('li')).toHaveText(['First','Second']);
});

test('a stalled compiler is terminated and the next compilation recovers',async({page})=>{
  await page.addInitScript(()=>{
    const NativeWorker=window.Worker;
    window.Worker=class extends NativeWorker {
      postMessage(data) {
        if(window.dropNextCompile) {window.dropNextCompile=false;return;}
        return super.postMessage(data);
      }
    };
  });
  await page.goto('/');await expect(page.getByRole('status')).toContainText('Ready');
  await page.evaluate(()=>{window.dropNextCompile=true;});await page.locator('#compile').click();
  await expect(page.getByRole('status')).toContainText('Compilation timed out',{timeout:7000});
  await page.locator('#compile').click();await expect(page.getByRole('status')).toContainText('Ready');
  await expect(preview(page).locator('output')).toHaveText('5 / 10');
});

test('a late failed runtime fetch cannot replace a newer static preview',async({page})=>{
  let release,finished;
  const released=new Promise(resolve=>{release=resolve;});
  const completed=new Promise(resolve=>{finished=resolve;});
  await page.route('**/preview-runtime.txt',async route=>{await released;await route.fulfill({status:503,body:'unavailable'});finished();});
  await page.goto('/');await expect(page.getByRole('status')).toContainText('Preparing preview');
  await page.locator('#preset').selectOption('static');
  await expect(page.getByRole('status')).toContainText('Ready · SSR');
  release();await completed;
  await expect(preview(page).getByRole('heading')).toHaveText('Hello, Browser.');
  await expect(page.getByRole('status')).toContainText('Ready · SSR');
});

test('opaque preview cannot access the editor; styles cannot inject scripts or load network resources',async({page})=>{
  const requests=[],blocked=[];
  await page.route('https://forbidden.invalid/**',route=>{requests.push(route.request().url());return route.abort();});
  page.on('requestfailed',request=>{if(request.url().includes('forbidden.invalid')) blocked.push(request.failure()?.errorText);});
  await page.goto('/');await expect(page.getByRole('status')).toContainText('Ready');
  await page.locator('#css').fill('body { background-image: url(https://forbidden.invalid/a.png); } /* </style><script>parent.document.body.dataset.compromised="yes"</script><style> */');
  await expect(page.getByRole('status')).toContainText('Ready');
  const frame=page.frames().find(frame=>frame.parentFrame());
  expect(await frame.evaluate(()=>{try {return parent.document.body.tagName;} catch(error) {return error.name;}})).toBe('SecurityError');
  expect(await page.locator('body').getAttribute('data-compromised')).toBeNull();
  expect(requests).toEqual([]);
  expect(blocked).toHaveLength(1);expect(blocked[0]).toMatch(/csp/i);
  await page.evaluate(()=>window.postMessage({channel:'isle-preview',token:'fake',type:'error',message:'spoofed'},'*'));
  await expect(page.getByRole('status')).toContainText('Ready');
});

for(const width of [390,1440]) test(`editor, preview and error state remain usable at ${width}px`,async({page},testInfo)=>{
  await page.setViewportSize({width,height:900});await page.goto('/');
  await expect(page.getByRole('status')).toContainText('Ready');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await expect(preview(page).locator('output')).toHaveText('5 / 10');
  await page.locator('#preview').screenshot({path:testInfo.outputPath('ready-preview.png')});
  await page.screenshot({path:testInfo.outputPath('ready.png'),fullPage:true});
  await page.locator('#source').fill('component Bad( {');await expect(page.getByRole('status')).toContainText('Compile error');
  await page.locator('#diagnostics button').first().click();await expect(page.locator('#source')).toBeFocused();
  await page.screenshot({path:testInfo.outputPath('error.png'),fullPage:true});
  await page.locator('#reset').click();await page.locator('#preset').selectOption('list');
  await expect(preview(page).locator('li')).toHaveCount(2);await preview(page).getByRole('button',{name:'Empty list'}).click();
  await expect(preview(page).locator('li')).toHaveText(['No rows']);
  await page.screenshot({path:testInfo.outputPath('empty.png'),fullPage:true});
  await page.locator('#preset').selectOption('fragments');await expect(preview(page).locator('[data-row]')).toHaveCount(2);
  await page.locator('#preview').screenshot({path:testInfo.outputPath('fragments-preview.png')});
  await page.screenshot({path:testInfo.outputPath('fragments.png'),fullPage:true});
  await page.locator('#preset').selectOption('events');
  await expect(preview(page).getByLabel('Message')).toBeVisible();
  await preview(page).getByLabel('Message').fill('Snapshot');
  await expect(preview(page).locator('[data-message]')).toHaveText('Snapshot');
  await expect(preview(page).locator('[data-clicks]')).toBeInViewport();
  await page.locator('#preview').screenshot({path:testInfo.outputPath('events-preview.png')});
  await page.screenshot({path:testInfo.outputPath('events.png'),fullPage:true});
  await page.locator('#preset').selectOption('layout');
  await expect(page.locator('#layout-status')).toContainText('Verified',{timeout:30000});
  await expect(preview(page).locator('.cell').first()).toHaveCSS('background-color','rgb(198, 233, 219)');
  await page.locator('#preview').scrollIntoViewIfNeeded();
  await page.locator('#preview').screenshot({path:testInfo.outputPath('layout-verified-preview.png')});
  await page.screenshot({path:testInfo.outputPath('layout-verified.png')});
  await page.locator('#preset').selectOption('layoutBroken');
  await expect(page.locator('#layout-status')).toContainText('Violated');
  await page.locator('#preview').scrollIntoViewIfNeeded();
  await page.locator('#preview').screenshot({path:testInfo.outputPath('layout-violated-preview.png')});
  await page.screenshot({path:testInfo.outputPath('layout-violated.png')});
  await page.locator('#source').fill((await page.locator('#source').inputValue()).replace('min-width: 40px','min-width: var(--cell-width)'));
  await expect(page.locator('#layout-status')).toContainText('Unknown');
  await expect(preview(page).locator('.cell').first()).toHaveCSS('background-color','rgb(198, 233, 219)');
  await page.locator('#preview').scrollIntoViewIfNeeded();
  await page.locator('#preview').screenshot({path:testInfo.outputPath('layout-unknown-preview.png')});
  await page.screenshot({path:testInfo.outputPath('layout-unknown.png')});
});


test('browser compilation keeps projected parent events on the native button only',async({page})=>{
  const source=await readFile(new URL('../../evals/scenarios/lexical-events/fixture.isle',import.meta.url),'utf8');
  await page.goto('/');await expect(page.getByRole('status')).toContainText('Ready');
  await page.locator('#props').fill('{}');await page.locator('#source').fill(source);
  const frame=preview(page),card=frame.locator('[data-review="a"]');
  await expect(frame.getByLabel('Clicks',{exact:true})).toHaveText('0');
  await card.evaluate(node=>{window.originalCard=node;});
  await card.getByRole('heading').click();
  await expect(frame.getByLabel('Clicks',{exact:true})).toHaveText('0');
  await expect(page.locator('#metrics')).toContainText('0 restored');
  await card.getByRole('button',{name:'Toggle',exact:true}).click();
  await expect(frame.getByLabel('Clicks',{exact:true})).toHaveText('1');
  await expect(card.locator('p')).toHaveText('Done');
  expect(await card.evaluate(node=>node===window.originalCard)).toBe(true);
  expect(await page.locator('#preview').getAttribute('srcdoc')).not.toMatch(/<ReviewCard\b|RenderFragment/);
});
