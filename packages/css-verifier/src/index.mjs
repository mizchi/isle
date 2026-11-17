import {analyzeInput} from './analyze.mjs';

/** Static box model only. This module never renders or executes UI code. */
export function analyzeLayout(tree,options) {
  return analyzeInput(tree,options);
}

// Form-control UA profiles per browser (the ua layout option) and the smallest reset that makes them agree.
export { uaProfiles, resolveUAProfile } from './layout/ua-profile.mjs';
export { suggestReset } from './layout/ua-reset.mjs';
