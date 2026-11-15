// Vue's own server rendering of an SFC template with given data, and the SFC's CSS unscoped (fidelity checks).
import {createSSRApp} from 'vue';
import {renderToString} from 'vue/server-renderer';
import {parse} from 'vue/compiler-sfc';
import {unscopeVueCSS} from '../src/index.mjs';
export const renderSSR = (source, data) => renderToString(createSSRApp({template: parse(source).descriptor.template.content, data: () => data}));
export const sfcCSS = source => unscopeVueCSS(parse(source).descriptor.styles.map(s => s.content).join('\n'));
