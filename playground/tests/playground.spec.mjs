import {test,expect} from '@playwright/test';
const preview=page=>page.frameLocator('#preview');
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
});
