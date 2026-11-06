import { isle, type IsleOptions } from '@isle/prototype/vite';
import { compile, requireIR, explain, type ProgramIR } from '@isle/prototype/compiler';
import { createActionHandler } from '@isle/prototype/server';
import { analyzeLayout } from '@isle/prototype/layout';
import { renderWidgetEmbed } from '@isle/prototype/widget';
import { defineWidget } from '@isle/prototype/widget/browser';
import { createResourceOwner } from '@isle/prototype/resources';

const options: IsleOptions = { entry: 'app.isle', mounts: [] };
isle(options);
const ir: ProgramIR = requireIR(compile('component Notice(){<p>Hello</p>}'));
const side: 'server' | 'client' | 'universal' = explain(ir).components[0].side;
void [side, createActionHandler, analyzeLayout, renderWidgetEmbed, defineWidget, createResourceOwner];
// @ts-expect-error The compiler consumes source text.
compile(42);
