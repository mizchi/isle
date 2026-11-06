import { renderToString } from '@builder.io/qwik/server';
import { manifest } from '@qwik-client-manifest';
import { App } from './app';
export async function render() { return (await renderToString(<App />, { manifest, base: '/dashboard/qwik/build/', containerTagName: 'div', containerAttributes: { id: 'app' } })).html; }
