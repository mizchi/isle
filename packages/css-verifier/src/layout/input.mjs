import { q, cmp } from './linear.mjs';
import { simpleSelector } from './css.mjs';
import { validateFontContract, validateTextMetrics } from './text-font.mjs';
export const boxTags = new Set('html body button div main aside section article nav header footer p span a strong em b i small h1 h2 h3 h4 h5 h6 output label'.split(' '));
const ancestorTags=new Set([...boxTags].filter(tag=>tag!=='button'));
const supportedOptions = new Set(['name', 'css', 'cssFile', 'reset', 'ancestors', 'viewport', 'hostInset', 'hostBlockInset', 'block', 'boxes', 'scrollbars', 'integrity']);
const supportedContract = new Set(['minInlineSize', 'minBlockSize', 'intrinsicBlockSize', 'wrap', 'overflow', 'overflowBlock', 'font', 'textMetrics']);
function finiteSize(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1_000_000) throw new Error(`Invalid layout ${name}`);
  return q(value);
}
export function validateOptions(options) {
  if (!options || Object.keys(options).some(key => !supportedOptions.has(key))) throw new Error('Invalid layout options');
  if (typeof options.css !== 'string' || options.css.length > 1_000_000) throw new Error('Invalid layout CSS input');
  if (options.name!==undefined && (typeof options.name!=='string' || !/^[A-Za-z][A-Za-z0-9_.-]{0,127}$/.test(options.name))) throw new Error('Invalid layout subject name');
  if (options.scrollbars!==undefined) {
    if (!Array.isArray(options.scrollbars) || !options.scrollbars.length || options.scrollbars.length>8 || new Set(options.scrollbars.map(p=>p?.name)).size!==options.scrollbars.length) throw new Error('Invalid scrollbar profiles');
    for(const profile of options.scrollbars) {
      if(!profile || typeof profile.name!=='string' || !/^[\w.-]{1,64}$/.test(profile.name) || Object.keys(profile).some(k=>!['name','inlineSize','blockSize','thinInlineSize','thinBlockSize'].includes(k))) throw new Error('Invalid scrollbar profile');
      for(const key of ['inlineSize','blockSize']) finiteSize(profile[key],key);
      for(const key of ['thinInlineSize','thinBlockSize']) if(profile[key]!==undefined) finiteSize(profile[key],key);
    }
  }
  if (options.reset !== undefined && (!Array.isArray(options.reset) || options.reset.length > 32 || options.reset.some(sheet => !sheet || typeof sheet.css !== 'string' || Object.keys(sheet).some(k => !['css', 'file'].includes(k)) || (sheet.file !== undefined && typeof sheet.file !== 'string')))) throw new Error('Invalid reset stylesheet contract');
  if ((options.reset ?? []).reduce((n, sheet) => n + sheet.css.length, options.css.length) > 1_000_000) throw new Error('Reset and app CSS size limit exceeded');
  if (options.ancestors !== undefined && (!Array.isArray(options.ancestors) || options.ancestors.length > 32 || options.ancestors.some(ancestor => !ancestor || !ancestorTags.has(ancestor.tag) || Object.keys(ancestor).some(k => !['tag', 'id', 'classes'].includes(k)) || (ancestor.id !== undefined && typeof ancestor.id !== 'string') || (ancestor.classes !== undefined && (!Array.isArray(ancestor.classes) || ancestor.classes.some(c => typeof c !== 'string')))))) throw new Error('Invalid ancestor contract: use supported HTML elements');
  if (!options.viewport || Object.keys(options.viewport).some(key => !['min', 'max', 'height'].includes(key))) throw new Error('Invalid viewport contract');
  const min = finiteSize(options.viewport?.min, 'viewport minimum'), max = finiteSize(options.viewport?.max, 'viewport maximum');
  if (cmp(min, max) > 0) throw new Error('Invalid viewport interval');
  finiteSize(options.hostInset ?? 0, 'hostInset');
  finiteSize(options.hostBlockInset ?? 0, 'hostBlockInset');
  if (options.block !== undefined && typeof options.block !== 'boolean') throw new Error('Invalid block option');
  if (options.block === true && !options.viewport.height) throw new Error('Block checking requires a viewport height interval');
  if (options.viewport.height !== undefined) {
    const h = options.viewport.height;
    if (!h || typeof h !== 'object' || Array.isArray(h) || Object.keys(h).some(key => !['min', 'max'].includes(key)) || options.block === false) throw new Error('Invalid viewport height contract');
    if (cmp(finiteSize(h.min, 'viewport height'), finiteSize(h.max, 'viewport height')) > 0) throw new Error('Invalid viewport height interval');
  }
  if (options.integrity !== undefined && options.integrity !== false && options.integrity !== true && !(options.integrity && typeof options.integrity === 'object' && Object.keys(options.integrity).every(k => ['targetSize', 'protrusion'].includes(k)) && (options.integrity.targetSize === undefined || (Number.isFinite(options.integrity.targetSize) && options.integrity.targetSize >= 0 && options.integrity.targetSize <= 1000)) && [undefined, 'all', 'painted'].includes(options.integrity.protrusion))) throw new Error("Invalid integrity option: true or {targetSize, protrusion: 'all' | 'painted'}");
  if (options.boxes === null || (options.boxes !== undefined && (typeof options.boxes !== 'object' || Array.isArray(options.boxes)))) throw new Error('Invalid box contracts');
  for (const [selector, contract] of Object.entries(options.boxes ?? {})) {
    if (!selector || !simpleSelector.test(selector) || !contract || Object.keys(contract).some(key => !supportedContract.has(key))) throw new Error('Invalid box contract');
    if (contract.minInlineSize !== undefined) finiteSize(contract.minInlineSize, 'minInlineSize');
    if (contract.minBlockSize !== undefined) finiteSize(contract.minBlockSize, 'minBlockSize');
    if (contract.intrinsicBlockSize !== undefined) {
      if (Array.isArray(contract.intrinsicBlockSize)) {
        const profile = contract.intrinsicBlockSize;
        if (!profile.length || profile.length > 32) throw new Error('Invalid intrinsic block profile');
        let previous = -1;
        for (const entry of profile) {
          finiteSize(entry.atLeastInlineSize, 'profile width'); finiteSize(entry.blockSize, 'profile blockSize');
          if (entry.atLeastInlineSize <= previous || Object.keys(entry).some(k => !['atLeastInlineSize', 'blockSize'].includes(k))) throw new Error('Invalid intrinsic block profile order');
          previous = entry.atLeastInlineSize;
        }
      } else finiteSize(contract.intrinsicBlockSize, 'intrinsicBlockSize');
    }
    if (contract.wrap !== undefined && !['normal', 'anywhere', 'nowrap'].includes(contract.wrap)) throw new Error('Invalid wrap contract');
    if (contract.font !== undefined) validateFontContract(contract.font);
    if (contract.textMetrics !== undefined) {
      validateTextMetrics(contract.textMetrics);
      if (!contract.font || contract.minInlineSize === undefined) throw new Error('Derived text metrics require the font contract and minInlineSize they were derived for');
    }
    if (contract.overflow !== undefined && !['fit', 'scroll', 'clip', 'visible'].includes(contract.overflow)) throw new Error('Invalid overflow contract');
    if (contract.overflowBlock !== undefined && !['fit', 'scroll', 'clip', 'visible'].includes(contract.overflowBlock)) throw new Error('Invalid block overflow contract');
  }
  return { min, max, minInclusive: true, maxInclusive: true };
}
