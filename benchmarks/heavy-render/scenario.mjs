export const scenarioSizes = Object.freeze([128, 1024, 4096]);
export const products = Object.freeze(Array.from({ length: 4096 }, (_, index) => Object.freeze({
  sku: `SKU-${String(index + 1).padStart(5, '0')}`,
  baseQuantity: 1 + index % 12,
  unitPrice: 100 + (index * 37) % 9900,
  unitGrams: 50 + (index * 13) % 1450,
})));

/** Independent expected result: all arithmetic in this workload stays in the safe integer range. */
export function expectedProduct(product, adjustment) {
  const quantity = product.baseQuantity + adjustment;
  return { quantity, cost: quantity * (product.unitPrice + 25), weight: quantity * product.unitGrams };
}

/** A build-time generator substitutes for the v0 language's not-yet-implemented list syntax. */
export function makeHeavySource(rows) {
  if (!Number.isInteger(rows) || rows < 1 || rows > products.length) throw new Error('rows must be an integer from 1 to 4096');
  const calls = products.slice(0, rows).map(product => `      <ProductRow sku=${JSON.stringify(product.sku)} baseQuantity={${product.baseQuantity}} unitPrice={${product.unitPrice}} unitGrams={${product.unitGrams}} adjustment={adjustment} />`).join('\n');
  return `// Generated catalog fixture. Each row performs actual order calculations.
component ProductRow(sku: string, baseQuantity: number, unitPrice: number, unitGrams: number, adjustment: number) {
  derive quantity = baseQuantity + adjustment;
  derive goods = quantity * unitPrice;
  derive handling = quantity * 20;
  derive subtotal = goods + handling;
  derive packaging = quantity * 5;
  derive cost = subtotal + packaging;
  derive weight = quantity * unitGrams;
  <li class="product-row" data-product={sku}>
    <div class="cell sku"><span class="label">商品コード</span><span>{sku}</span></div>
    <div class="cell"><span class="label">単価</span><span>¥{unitPrice}</span></div>
    <div class="cell"><span class="label">数量</span><span data-value="quantity">{quantity}</span></div>
    <div class="cell"><span class="label">発注額</span><span data-value="cost" data-cost={cost}>¥{cost}</span></div>
    <div class="cell"><span class="label">重量</span><span data-value="weight">{weight} g</span></div>
  </li>
}

client component Audit() {
  state checks = 0;
  <aside class="audit surface" data-audit="true">
    <div><h3>確認メモ</h3><p>確認回数: <output data-value="checks">{checks}</output></p></div>
    <button type="button" data-action="check">on click check { checks += 1; }確認を記録</button>
  </aside>
}

client component Sheet(initialAdjustment: number) {
  state adjustment = initialAdjustment;
  derive unused = adjustment * 9999;
  <section class="sheet surface" data-sheet="true">
    <header class="sheet-header">
      <div><h3>発注数量の調整</h3><p>各商品の追加数量: <output data-value="adjustment">{adjustment}</output> 個</p></div>
      <button type="button" data-action="add-all">on click addAll { adjustment += 1; }表示中の商品を1個ずつ追加</button>
    </header>
    <ol class="products" data-products="true">
${calls}
    </ol>
  </section>
}

server component Page() {
  <div class="workspace" data-page="orders"><Audit /><Sheet initialAdjustment={0} /></div>
}
`;
}
