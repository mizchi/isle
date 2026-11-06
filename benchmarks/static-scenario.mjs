// Deterministic synthetic fixture: literal decoration surrounding one changing string.
export const prefix = Array.from({ length: 48 }, (_, index) => `catalog-${index.toString(36)}:${(index * 7919).toString(36)} / `).join('');
export const suffix = ' — fixed suffix';
export const source = `export client component Decorated({ initial }: { initial: string }) {
  state prefix = ${JSON.stringify(prefix)};
  state suffix = ${JSON.stringify(suffix)};
  state title = initial;
  derive label = prefix + title + suffix;
  <button>on click append { title = title + "!"; }{label}</button>
}`;
export const attributes = `export client component AttributeOnly() {
  state locked = false;
  <button title={locked} disabled={locked}>on click lock { locked = true; }Static label</button>
}`;

export const aliases = `export client component Aliased({ base }: { base: number }) {
  state copied = base;
  state copiedAgain = copied;
  state count = 0;
  <button>on click add { count += base + copied + copiedAgain; }{count}</button>
}`;

export const repeated = `export client component Repeated({ factor }: { factor: number }) {
  state count = 1;
  derive base = count * 2 + factor;
  derive left = base * base + 1;
  derive right = base + left;
  derive total = left + right;
  <div>
    <button>on click add { count += 1; }{total}</button>
    <output title={total}>{total}</output>
  </div>
}`;
