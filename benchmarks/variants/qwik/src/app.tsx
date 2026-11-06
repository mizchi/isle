import { component$, useSignal, useComputed$ } from '@builder.io/qwik';
import { fixture } from '../../../shared/scenario.mjs';
import { renameDocument } from '../../../shared/remote.mjs';

const Counter = component$(({ initial }: { initial: number }) => {
  const count = useSignal(initial);
  const doubled = useComputed$(() => count.value * 2);
  return <button class="control" type="button" onClick$={() => { count.value += 1; }}>{count.value} / {doubled.value}</button>;
});

const Editor = component$(({ id, initial }: { id: string; initial: string }) => {
  const title = useSignal(initial);
  return <button class="control" type="button" onClick$={async () => {
    title.value = (await renameDocument({ id, title: title.value + '!' })).title;
  }}>{title.value}</button>;
});

export const App = component$(() => <>
  {fixture.counters.map(counter => <section class="card" key={counter.label}><h2>{counter.label}</h2><Counter initial={counter.initial} /></section>)}
  <section class="card"><h2>{fixture.editor.label}</h2><Editor id={fixture.editor.id} initial={fixture.editor.initial} /></section>
</>);
