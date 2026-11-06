import { evaluateLayoutRejections, type LayoutExampleCase } from '../../tools/layout-rejections.mjs';
const example: LayoutExampleCase = {
  id: 'float', title: 'float', note: 'Grid policy',
  reject: { source: 'component C() { <p>x</p> }', options: { css: 'p{float:left}', viewport: { min: 320, max: 800 } } },
  accept: { source: 'component C() { <p>x</p> }', options: { css: '', viewport: { min: 320, max: 800 } } },
  expected: { status: 'violated', code: 'E_LAYOUT_FLOAT' },
};
void evaluateLayoutRejections([example], '/tmp/isle-example-typecheck');
// @ts-expect-error A rejected example must describe violated or unknown, never verified.
example.expected.status = 'verified';
