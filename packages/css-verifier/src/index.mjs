import {analyzeInput} from './analyze.mjs';

/** Static box model only. This module never renders or executes UI code. */
export function analyzeLayout(tree,options) {
  return analyzeInput(tree,options);
}
