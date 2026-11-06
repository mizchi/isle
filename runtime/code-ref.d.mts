import type { CodeRef, CodeFunction, CodeResolver, ModuleImporter } from '../lib/code-contracts.d.ts';
export function codeRef<F extends CodeFunction = CodeFunction>(url: string, symbol: string, captures?: readonly number[]): CodeRef<F>;
export function encodeCodeRef(ref: CodeRef): string;
export function decodeCodeRef<F extends CodeFunction = CodeFunction>(text: string): CodeRef<F>;
export function createCodeResolver(baseURL: string | URL, importModule?: ModuleImporter): CodeResolver;
