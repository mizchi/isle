import { analyzeLayout, type LayoutOptions, type LayoutSummary } from '../../lib/layout.mjs';
import type { ProgramIR } from '../../lib/contracts.d.ts';
declare const ir: ProgramIR;
const options: LayoutOptions = {
  css: '.panel { padding: 16px; }', viewport: { min: 352, max: 1280 },
  boxes: { '.panel': { minInlineSize: 320, overflow: 'fit', wrap: 'anywhere' } },
};
const summary: LayoutSummary = analyzeLayout(ir, options);
void summary;
analyzeLayout(ir, { ...options, reset: [{ css: 'html{box-sizing:border-box}*{box-sizing:inherit}', file: 'reset.css' }], ancestors: [{ tag: 'html' }, { tag: 'body', classes: ['host'] }] });
analyzeLayout(ir, { ...options, block: true, viewport: { min: 400, max: 1200, height: { min: 300, max: 900 } },
  boxes: { '.panel': { minBlockSize: 40, intrinsicBlockSize: [{ atLeastInlineSize: 400, blockSize: 40 }], overflowBlock: 'scroll' } },
});
// @ts-expect-error overflow policies are a closed contract.
analyzeLayout(ir, { ...options, boxes: { '.panel': { overflow: 'hide-errors' } } });
