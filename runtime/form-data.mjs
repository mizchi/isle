/** Schema-owned primitive decoding. Files, repeated names and coercion of empty numbers are rejected. */
export function decodeFormData(schema, entries) {
  const fields = new Map(schema.fields.map(field => [field.name, field])), values = Object.create(null), issues = [];
  const seen = new Set();
  for (const [name, raw] of entries) {
    const field = fields.get(name);
    if (!field) { issues.push({ field: '', code: 'unknownField' }); continue; }
    if (seen.has(name)) { issues.push({ field: name, code: 'duplicate' }); continue; }
    seen.add(name);
    if (typeof raw !== 'string') { issues.push({ field: name, code: 'type' }); continue; }
    if (field.type === 'number') {
      const number = Number(raw);
      if (!/^-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(raw) || !Number.isFinite(number) || Object.is(number, -0)) issues.push({ field: name, code: 'type' });
      else values[name] = number;
    } else values[name] = field.type === 'boolean' ? true : raw.replace(/\r\n?/g, '\n');
  }
  for (const field of schema.fields) if (!seen.has(field.name)) {
    if (field.type === 'boolean') values[field.name] = false;
    else issues.push({ field: field.name, code: 'required' });
  }
  return issues.length ? { ok: false, issues } : { ok: true, value: { ...values } };
}
