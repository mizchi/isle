import {readFile} from 'node:fs/promises';
import {compile} from './compiler-core.mjs';
export {compile,checkDependencies,requireIR,explain} from './compiler-core.mjs';
export async function compileFile(path) { return compile(await readFile(path,'utf8')); }
