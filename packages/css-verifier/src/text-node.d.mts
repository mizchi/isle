import type {TextMetrics, TextShaper} from './text.d.mts';
export * from './text.d.mts';
export const textMetricsPath: string;
export function loadShaper(path?: string): Promise<TextShaper>;
export function loadTextMetrics(options: { fonts: Record<string, { file?: string; data?: Uint8Array; weight?: number }>; limits?: { characters?: number; maxLength?: number } }): Promise<TextMetrics>;
