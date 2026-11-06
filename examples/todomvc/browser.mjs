import { boot } from 'virtual:isle-loader';
import { connectTodoHost } from './host.mjs';

boot();
connectTodoHost(document.querySelector('.todoapp'), 'isle');
