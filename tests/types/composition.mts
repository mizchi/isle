import { prepareProgram } from '../../lib/codegen.mjs';
import type { ProgramIR, TemplateNode } from '../../lib/contracts.d.ts';

const call: TemplateNode = { kind: 'island', component: 'Counter', site: 'c0', props: [
  { name: 'initial', value: { kind: 'number', value: 5 } },
], children: [{ kind: 'slot' }] };
const ir: ProgramIR = { version: 1, schemas: [], actions: [], components: [
  { name: 'Page', side: 'server', props: [], states: [], derives: [], root: call },
] };
const program = prepareProgram(ir);
program.render('Page', {}, { mode: 'ssr' });
program.renderAll([{ component: 'Page', props: {}, label: 'Page' }]);
// @ts-expect-error render fragments never become wire props
program.render('Page', { children: () => '<p>unsafe</p>' });
// @ts-expect-error components are statically named declarations, not callable callbacks
const dynamic: TemplateNode = { kind: 'island', component: () => 'Counter', site: 'c0', props: [], children: [] };
void dynamic;
