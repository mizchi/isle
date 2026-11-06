import type { Schema } from './schema-contracts.d.ts';
type Definition =
  | { type: 'string'; minLength?: number; maxLength?: number; equals?: string; sameAs?: string; pattern?: string; format?: 'email' }
  | { type: 'number'; min?: number; max?: number; integer?: true; equals?: number; sameAs?: string }
  | { type: 'boolean'; equals?: boolean; sameAs?: string };
declare const definitions: unique symbol;
type StrictDefinitions<F extends Record<string, Definition>> = {
  [K in keyof F]: F[K] & Record<Exclude<keyof F[K], keyof Extract<Definition, { type: F[K]['type'] }>>, never> & {
    sameAs?: { [P in keyof F]: P extends K ? never : F[P]['type'] extends F[K]['type'] ? P : never }[keyof F]
  }
};
export type DefinedSchema<F extends Record<string, Definition>> = Schema & { readonly [definitions]: F };
export type InferSchema<S> = S extends DefinedSchema<infer F> ? {
  [K in keyof F]: F[K]['type'] extends 'string' ? string : F[K]['type'] extends 'number' ? number : boolean
} : never;
export function defineSchema<const F extends Record<string, Definition>>(name: string, fields: F & StrictDefinitions<F>): DefinedSchema<F>;
export function toSchemaIR(schema: Schema): Schema;
