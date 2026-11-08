import {compile,requireIR} from '../../lib/compiler.mjs';
import {prepareProgram} from '../../lib/codegen.mjs';
import type {ValuePhase} from '../../lib/resume-plan.mjs';
const generated=prepareProgram(requireIR(compile('client component C(){state n=0;<button>on click add{n+=1;}{n}</button>}'))).get('C').generate();
const phases:ValuePhase[]=generated.analysis.valuePhases;
const phase:'server'|'resume'|'unused'=phases[0].phase;
// @ts-expect-error Client/server declarations and storage phases are distinct contracts.
const invalid:ValuePhase={name:'n',owner:'C',phase:'client'};
void phase;void invalid;
