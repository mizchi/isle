import { boot } from 'virtual:isle-loader';
import { loadIslands } from '../../../runtime/loader.mjs';
window.createTestLoader = loadIslands;
window.isleDemo = boot();
window.reconnectIsle = () => boot();
