import type { InteractionTiming } from '../lib/client-contracts.d.ts';
export function createInteraction(performance: Performance, handlerId: string, scopeId: string, event: string): InteractionTiming;
