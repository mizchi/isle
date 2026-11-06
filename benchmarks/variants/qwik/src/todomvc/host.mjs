import { connectTodoHost } from '../../../../../examples/todomvc/host.mjs';
const start = () => connectTodoHost(document.querySelector('.todoapp'), 'qwik');
// SSR emits the framework loader as an async module. Restore after it has registered events.
if (document.readyState === 'complete') start();
else addEventListener('load', start, { once: true });
