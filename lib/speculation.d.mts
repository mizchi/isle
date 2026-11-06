import type { HtmlTagDescriptor } from 'vite';
export type SpeculationEagerness = 'immediate' | 'eager' | 'moderate' | 'conservative';
type PredicateValues = {
  and: SpeculationPredicate[];
  or: SpeculationPredicate[];
  not: SpeculationPredicate;
  href_matches: string | string[];
  selector_matches: string | string[];
};
export type SpeculationPredicate = {
  [K in keyof PredicateValues]: { [P in K]: PredicateValues[P] } & { [P in Exclude<keyof PredicateValues, K>]?: never }
}[keyof PredicateValues];
export type SpeculationRule = {
  eagerness?: SpeculationEagerness;
  tag?: string | null;
  referrer_policy?: Exclude<ReferrerPolicy, ''>;
} & ({ urls: string[]; where?: never } | { where: SpeculationPredicate; urls?: never });
/** Native inline JSON subset. Disabled by default; unsupported browsers ignore the data block. */
export interface SpeculationRules {
  tag?: string | null;
  prefetch?: SpeculationRule[];
  prerender?: SpeculationRule[];
}
export function speculationRules(input?: SpeculationRules | false): SpeculationRules | null;
export function speculationTags(input?: SpeculationRules | false, nonce?: string): HtmlTagDescriptor[];
