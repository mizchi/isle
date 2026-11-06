import { loadingPriority } from './loading-plan.mjs';

/** Keep small siblings together; a byte budget never crosses component ownership.
 * Schema forms have independent runtime dependencies, so always retain their own boundary.
 */
export function planHandlerChunks(components, maxBytes = 1024, policies) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) throw new Error('Invalid handler chunk byte budget');
  const encoder = new TextEncoder(), chunks = [];
  for (const component of components) {
    let pending = [], bytes = 0, index = 0;
    const flush = () => {
      if (!pending.length) return;
      chunks.push({ name: pending.length === 1 ? pending[0].id : `${component.name}.g${index}`, handlers: pending });
      pending = []; bytes = 0; index++;
    };
    const groups = new Map();
    for (const handler of component.handlers) {
      const category = policies?.get(handler.id) === 'auto' ? loadingPriority(handler) ?? 'interaction' : 'manual';
      if (!groups.has(category)) groups.set(category, []);
      groups.get(category).push(handler);
    }
    for (const handlers of groups.values()) {
      for (const handler of handlers) {
        const size = encoder.encode(handler.code).byteLength;
        if (handler.form || !maxBytes || size > maxBytes) {
          flush(); pending.push(handler); flush(); continue;
        }
        if (bytes + size > maxBytes) flush();
        pending.push(handler); bytes += size;
      }
      flush();
    }
  }
  return chunks;
}
