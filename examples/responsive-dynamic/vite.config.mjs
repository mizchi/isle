import {fileURLToPath} from 'node:url';
import {defineConfig} from 'vite';
import {isle} from '../../lib/vite.mjs';
export const layout={
  css:'./app.css',viewport:{min:320,max:1280,height:{min:360,max:900}},
  scrollbars:[{name:'overlay',inlineSize:0,blockSize:0},{name:'classic',inlineSize:15,blockSize:15}],
  boxes:{
    '.title':{minInlineSize:240,minBlockSize:26},
    '.action':{minInlineSize:48,minBlockSize:20},
    '.scroller':{overflowBlock:'scroll'},
    '.tile':{minInlineSize:80,minBlockSize:24},
    '.empty':{minInlineSize:120,minBlockSize:24},
    '.note':{minInlineSize:200,minBlockSize:18},
  },
};
export default defineConfig({root:fileURLToPath(new URL('.',import.meta.url)),base:'./',server:{port:4333,strictPort:true},
  plugins:[isle({entry:fileURLToPath(new URL('app.isle',import.meta.url)),mounts:[{component:'DynamicBoard',props:{}}],wrapMounts:false,layout})],
});
