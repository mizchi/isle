import {test,expect} from '@playwright/test';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';

test.use({launchOptions:{ignoreDefaultArgs:['--hide-scrollbars']}});
const binary=fileURLToPath(new URL('../../node_modules/.bin/vlmkit',import.meta.url));
async function paintChanges(baseline,current) {
  const {stdout}=await promisify(execFile)(binary,['diff','png',baseline,current,'--json','--no-heatmap'],{maxBuffer:4<<20});
  const report=JSON.parse(stdout);
  expect(report.sizeDelta).toEqual({width:0,height:0});
  // Native form controls and DOM text can antialias differently. Only the
  // tool's measured edge/compositing noise is exempt; positional changes fail.
  return report.changes.filter(change=>change.type!=='render-noise');
}

for(const width of [390,1440]) test(`overlay editors preserve native geometry through scroll and resize at ${width}px`,async({page},testInfo)=>{
  await page.setViewportSize({width,height:900});await page.goto('/');
  await expect(page.getByRole('status')).toContainText('Ready');
  await expect(page.locator('.code-editor')).toHaveCount(4);
  await expect(page.locator('#source').locator('..').locator('.syntax-token--keyword').first()).toHaveText('client');
  await page.screenshot({path:testInfo.outputPath('highlighted.png'),fullPage:true});
  await page.locator('.editor').screenshot({path:testInfo.outputPath('highlighted-editor.png')});
  await page.locator('#auto').uncheck();
  // Reserve a classic scrollbar gutter too; the decoration must stop before it.
  await page.addStyleTag({content:'.code-editor textarea { scrollbar-gutter: stable; } .code-editor textarea::-webkit-scrollbar {width:14px;height:14px}'});
  const source=Array.from({length:140},(_,i)=>`\tstate row${i} = "${'a long line 日本語 '.repeat(8)}"; // ${i}`).join('\n')+'\n\n';
  for(const id of ['source','props','css','layout']) {
    const input=page.locator('#'+id),editor=input.locator('..'),paint=editor.locator('.code-editor__content');
    await input.fill(source);await expect.poll(()=>paint.textContent()).toBe(source);
    const geometry=()=>input.evaluate(input=>{
      const viewport=input.parentElement.querySelector('.code-editor__highlight'),content=viewport.firstElementChild;
      const matrix=new DOMMatrix(getComputedStyle(content).transform),style=getComputedStyle(input),other=getComputedStyle(content);
      return {x:input.scrollLeft,y:input.scrollTop,tx:matrix.m41,ty:matrix.m42,
        width:viewport.clientWidth,height:viewport.clientHeight,expectedWidth:input.clientWidth,expectedHeight:input.clientHeight,outerWidth:input.offsetWidth,outerHeight:input.offsetHeight,
        textHeight:content.offsetHeight,nativeHeight:input.scrollHeight,
        font:[style.fontFamily,style.fontSize,style.lineHeight,style.letterSpacing,style.fontVariantLigatures],
        paintFont:[other.fontFamily,other.fontSize,other.lineHeight,other.letterSpacing,other.fontVariantLigatures],tab:style.tabSize,paintTab:other.tabSize};
    });
    await input.evaluate(input=>{input.scrollTop=input.scrollHeight;input.scrollLeft=input.scrollWidth;});
    await expect.poll(async()=>{const g=await geometry();return g.x>0 && g.y>0 && g.tx===-g.x && g.ty===-g.y;}).toBe(true);
    let g=await geometry();
    expect(g.width).toBe(g.expectedWidth);expect(g.height).toBe(g.expectedHeight);
    expect(g.width).toBeLessThan(g.outerWidth);expect(g.height).toBeLessThan(g.outerHeight);
    expect(Math.abs(g.textHeight-g.nativeHeight),JSON.stringify(g)).toBeLessThanOrEqual(1);
    expect(g.font).toEqual(g.paintFont);expect(g.tab).toBe(g.paintTab);
    await input.evaluate(input=>{input.style.height='219px';});
    await expect.poll(async()=>{const g=await geometry();return g.height===g.expectedHeight;}).toBe(true);
    await input.evaluate(input=>{input.scrollTop=97;input.scrollLeft=83;});
    await expect.poll(async()=>{const g=await geometry();return [g.tx,g.ty];}).toEqual([-83,-97]);
    await editor.screenshot({path:testInfo.outputPath(`scrolled-${id}.png`)});
    // Independent visual oracle: the same native input, with decoration hidden.
    const colors=await page.addStyleTag({content:'.code-editor__content, .code-editor__content span {color:#233d38!important}'});
    const decorated=testInfo.outputPath(`aligned-${id}.png`),reference=testInfo.outputPath(`native-${id}.png`);
    await editor.screenshot({path:decorated,caret:'hide'});
    const shifted=id==='source' && width===390 ? testInfo.outputPath('misaligned-control.png') : undefined;
    if(shifted) {
      await paint.evaluate(node=>{node.style.transform='translate(-84px,-97px)';});
      await editor.screenshot({path:shifted,caret:'hide'});
      await paint.evaluate(node=>{node.style.transform='translate(-83px,-97px)';});
    }
    const native=await page.addStyleTag({content:'.code-editor > textarea {color:#233d38!important;-webkit-text-fill-color:#233d38!important}.code-editor__highlight{visibility:hidden!important}'});
    await editor.screenshot({path:reference,caret:'hide'});
    expect(await paintChanges(decorated,reference),'highlight glyphs must occupy the native textarea pixels').toEqual([]);
    if(shifted) expect((await paintChanges(shifted,reference)).length,'the oracle detects a deliberate one-pixel offset').toBeGreaterThan(0);
    await native.evaluate(node=>node.remove());await colors.evaluate(node=>node.remove());
    await input.hover();await page.mouse.wheel(61,73);
    await expect.poll(async()=>{const g=await geometry();return g.x>83 && g.y>97 && g.tx===-g.x && g.ty===-g.y;}).toBe(true);
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('overlay refresh keeps selection, undo, literal markup and native IME/forced-colors fallbacks',async({page})=>{
  await page.goto('/');await expect(page.getByRole('status')).toContainText('Ready');
  await page.locator('#auto').uncheck();
  const input=page.getByRole('textbox',{name:'Isle source',exact:true}),editor=input.locator('..'),paint=editor.locator('.code-editor__content');
  const source='client component Counter() { <p>日本語</p> }\n';
  await input.fill(source);await input.focus();
  await input.evaluate(input=>input.setSelectionRange(7,16,'backward'));
  // A refresh triggered by Compile must not replace the textarea or its selection.
  await input.press('ControlOrMeta+Enter');
  expect(await input.evaluate(input=>[input.selectionStart,input.selectionEnd,input.selectionDirection])).toEqual([7,16,'backward']);
  await page.keyboard.insertText('template');await expect.poll(()=>paint.textContent()).toBe(source.replace('component','template'));
  await input.press('ControlOrMeta+Z');await expect(input).toHaveValue(source);
  const payload='</textarea><img src=x onerror="window.compromised=true"><script>window.compromised=true</script>';
  await input.fill(payload);await expect(paint).toHaveText(payload,{useInnerText:false});
  await expect(editor.locator('img,script')).toHaveCount(0);expect(await page.evaluate(()=>window.compromised)).toBeUndefined();
  await input.dispatchEvent('compositionstart');
  await expect(editor.locator('.code-editor__highlight')).toHaveCSS('visibility','hidden');
  expect(await input.evaluate(input=>getComputedStyle(input).webkitTextFillColor)).not.toBe('rgba(0, 0, 0, 0)');
  await input.dispatchEvent('compositionend');
  await expect(editor.locator('.code-editor__highlight')).toHaveCSS('visibility','visible');
  await page.emulateMedia({forcedColors:'active'});
  await expect(editor.locator('.code-editor__highlight')).toHaveCSS('display','none');
  expect(await input.evaluate(input=>getComputedStyle(input).webkitTextFillColor)).not.toBe('rgba(0, 0, 0, 0)');
  await page.emulateMedia({forcedColors:'none'});
  await page.locator('#reset').click();await expect(page.getByRole('status')).toContainText('Ready');
  expect(await paint.textContent()).toBe(await input.inputValue());
});
