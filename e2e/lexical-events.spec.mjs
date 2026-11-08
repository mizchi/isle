import {test,expect} from '@playwright/test';

test('only a projected button loads and updates its parent; heading and padding are inert',async({page})=>{
  const errors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
  await page.goto('/');
  const card=page.locator('[data-review="a"]');
  await expect(page.getByLabel('Open reviews',{exact:true})).toHaveText('2');
  await card.evaluate(node=>{window.originalCard=node;});
  expect(await card.locator('h2').evaluate(node=>node.closest('[data-isle-on-click]')===null)).toBe(true);
  await card.locator('h2').click();
  await card.click({position:{x:2,y:2}});
  await expect(page.getByLabel('Open reviews',{exact:true})).toHaveText('2');
  expect(requests.some(url=>/ReviewQueue\./.test(url))).toBe(false);
  await card.getByRole('button',{name:'Toggle',exact:true}).click();
  await expect(card.locator('p')).toHaveText('Done');
  await expect(page.getByLabel('Open reviews',{exact:true})).toHaveText('1');
  expect(await card.evaluate(node=>node===window.originalCard)).toBe(true);
  await card.getByRole('button',{name:'Toggle',exact:true}).press('Enter');
  await expect(card.locator('p')).toHaveText('Open');
  await expect(page.getByLabel('Open reviews',{exact:true})).toHaveText('2');
  expect(await card.evaluate(node=>node===window.originalCard)).toBe(true);
  expect(errors).toEqual([]);
});

test('projected buttons keep row captures after filter removal and recreation',async({page})=>{
  await page.goto('/');
  await page.getByRole('button',{name:'Open',exact:true}).click();
  await expect(page.locator('[data-review]')).toHaveCount(2);
  await page.locator('[data-review="a"]').getByRole('button',{name:'Toggle',exact:true}).click();
  await expect(page.locator('[data-review]')).toHaveCount(1);
  await page.getByRole('button',{name:'Done',exact:true}).click();
  await expect(page.locator('[data-review]')).toHaveCount(2);
  await page.locator('[data-review="b"]').getByRole('button',{name:'Toggle',exact:true}).click();
  await expect(page.locator('[data-review]')).toHaveCount(1);
  await expect(page.locator('[data-review="a"] p')).toHaveText('Done');
  await expect(page.getByLabel('Open reviews',{exact:true})).toHaveText('2');
});
