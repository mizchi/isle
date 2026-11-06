import { hydrate } from 'preact';
import { App } from './app';
import { connectTodoHost } from '../../../../../examples/todomvc/host.mjs';
hydrate(<App />, document.getElementById('app')!);
connectTodoHost(document.querySelector('.todoapp'), 'preact');
