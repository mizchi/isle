import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { isle } from '../../lib/vite.mjs';
export const layout = {
  css:'./app.css', reset:['./reset.css'],
  viewport:{min:320,max:1280,height:{min:240,max:900}},
  boxes:{
    '.title':{minInlineSize:200,minBlockSize:26},
    '.tile':{minInlineSize:24,minBlockSize:24},
    '.note':{minInlineSize:200,minBlockSize:18},
  },
};
export default defineConfig({
  root:fileURLToPath(new URL('.',import.meta.url)), base:'./', server:{port:4332,strictPort:true},
  plugins:[isle({entry:fileURLToPath(new URL('./app.isle',import.meta.url)),
    mounts:[{component:'ResponsiveBoard',props:{}}],wrapMounts:false,layout})],
});
