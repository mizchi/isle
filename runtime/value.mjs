/** Closed JSON value algebra. No prototypes, sparse arrays, getters or coercion at boundaries. */
export function validValue(type, value) {
  if (typeof type === 'string') return typeof value === type && (type !== 'number' || (Number.isFinite(value) && !Object.is(value, -0)));
  if (type?.array) return Array.isArray(value) && Object.keys(value).length === value.length && Object.keys(value).every((key, index) => key === String(index) && Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value') && validValue(type.array, value[key]));
  if (type?.record) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return false;
    const fields = type.record, keys = Object.keys(value);
    return keys.length === Object.keys(fields).length && keys.every(key => Object.hasOwn(fields, key) &&
      Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value') && validValue(fields[key], value[key]));
  }
  return false;
}
export function arrayIndex(value, index) {
  if (!Array.isArray(value) || !Number.isSafeInteger(index) || index < 0 || index >= value.length) throw new Error('Array index out of bounds');
  return value[index];
}
export function rowKey(value) {
  if (typeof value !== 'string' && !(typeof value === 'number' && Number.isSafeInteger(value) && !Object.is(value, -0))) throw new Error('Invalid row key');
  return encodeURIComponent(JSON.stringify([typeof value, value]));
}
/** The DSL's explicit JSON.parse<T> boundary checks its closed wire type. */
export function parseJSON(text, type) {
  const value = JSON.parse(text);
  if (!validValue(type, value)) throw new Error('Invalid decoded value');
  return value;
}
