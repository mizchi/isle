/** Font settings a text contract was measured with; the core checks the computed CSS against them. */
export interface TextFont { family: string; size: number; lineHeight: number; weight?: number }
export type TextContract =
  | { font: TextFont; content: string; overflowWrap?: 'normal' | 'break-word'; /** content language: measured alone, must equal the element lang */ lang?: string }
  | { font: TextFont; characters: string; maxLength: number; lang?: string };
export interface TextShaper {
  load(data: Uint8Array): number;
  info(handle: number): { unitsPerEm: number; axes: { tag: string; min: number; default: number; max: number }[] };
  shape(handle: number, text: string, size: number, axes: Record<string, number>, language?: string): unknown;
}
export interface FontEntry { data: Uint8Array; weight?: number; sha256?: string; file?: string }
export interface LineProfile { text: string; width: number; minContent: number; overflowWrap: 'normal' | 'anywhere' | 'break-word'; profile: { atLeastInlineSize: number; lines: number | null }[] }
export interface MeasuredText { text: string; width: number; bound: number }
export interface TextDomainBounds { characters: string; maxLength: number; perCharacter: number; pairAdjustment: number; widest: string; bounds: number[] }
export interface TextMetrics {
  measureText(input: { font: TextFont; text: string; lang?: string }): MeasuredText;
  domainBounds(input: { font: TextFont; characters: string; maxLength: number; lang?: string }): TextDomainBounds;
  /** Line counts of wrapped fixed text over the content width (UAX #14 subset). */
  breakLines(input: { font: TextFont; text: string; overflowWrap?: 'normal' | 'anywhere' | 'break-word'; lang?: string }): LineProfile;
  /** Replace `{text}` box contracts with minInlineSize/intrinsicBlockSize/wrap/font/textMetrics. */
  resolveBoxes<T extends Record<string, object>>(boxes?: T): Record<string, object>;
  resolveOptions<T extends { boxes?: Record<string, object> }>(options: T): T;
}
export const layoutAllowance: { unit: number; rule: string };
/** Shaped advance snapped up to 1/64 px plus one 1/64 px unit. */
export function upperBound(width: number): number;
/** Break opportunities of collapsed text (a break before each index); throws U_LAYOUT_TEXT_METRICS outside the model. */
export function breakOpportunities(text: string): number[];
/** Script runs as Chromium segments them (Script_Extensions). */
export function scriptSegments(text: string): string[];
export function scriptRuns(text: string): number;
export function createTextMetrics(input: { fonts: Record<string, FontEntry>; shaper: TextShaper; limits?: { characters?: number; maxLength?: number } }): TextMetrics;
