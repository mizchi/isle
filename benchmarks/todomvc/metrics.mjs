import { gzipSync, brotliCompressSync, constants } from 'node:zlib';
export function measureBytes(body) {
  return { raw: body.length, gzip: gzipSync(body, { level: 6 }).length,
    br: brotliCompressSync(body, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length };
}
export const sumSizes = values => values.reduce((sum, value) => ({ raw: sum.raw + value.raw, gzip: sum.gzip + value.gzip, br: sum.br + value.br }), { raw: 0, gzip: 0, br: 0 });
