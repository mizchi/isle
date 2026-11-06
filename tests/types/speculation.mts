import { speculationRules, type SpeculationRules } from '../../lib/speculation.mjs';
import type { IsleOptions } from '../../lib/vite.mjs';

const rules: SpeculationRules = {
  tag: 'navigation',
  prefetch: [{ urls: ['/guide'], eagerness: 'immediate' }],
  prerender: [{ where: { and: [{ href_matches: '/*' }, { selector_matches: 'a[data-prerender]' }] }, eagerness: 'moderate' }],
};
const options: IsleOptions = { entry: 'app.isle', mounts: [], speculation: rules };
speculationRules(options.speculation);
// @ts-expect-error Sources are mutually exclusive.
speculationRules({ prerender: [{ urls: ['/next'], where: { href_matches: '/*' } }] });
// @ts-expect-error A predicate has exactly one operation.
speculationRules({ prerender: [{ where: { href_matches: '/*', selector_matches: 'a' } }] });
// @ts-expect-error Navigation eagerness is a native enum, not the chunk loading policy.
speculationRules({ prefetch: [{ urls: ['/next'], eagerness: 'lazy' }] });
