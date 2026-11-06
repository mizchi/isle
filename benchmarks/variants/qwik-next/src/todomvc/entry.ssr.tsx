import { renderToString } from '@qwik.dev/core/server';
import { App } from './app';
export async function render() {
  return (await renderToString(<App />, { base: '/todomvc/qwik-next/build/', containerTagName: 'div', containerAttributes: { id: 'app' } })).html;
}
