import { useState } from 'preact/hooks';
import { fixture } from '../../../shared/scenario.mjs';
import { renameDocument } from '../../../shared/remote.mjs';

function Counter({ initial }: { initial: number }) {
  const [count, setCount] = useState(initial);
  const doubled = count * 2;
  return <button class="control" type="button" onClick={() => setCount(count + 1)}>{count} / {doubled}</button>;
}

function Editor({ id, initial }: { id: string; initial: string }) {
  const [title, setTitle] = useState(initial);
  return <button class="control" type="button" onClick={async () => {
    setTitle((await renameDocument({ id, title: title + '!' })).title);
  }}>{title}</button>;
}

export function App() {
  return <>
    {fixture.counters.map(counter => <section class="card" key={counter.label}><h2>{counter.label}</h2><Counter initial={counter.initial} /></section>)}
    <section class="card"><h2>{fixture.editor.label}</h2><Editor id={fixture.editor.id} initial={fixture.editor.initial} /></section>
  </>;
}
