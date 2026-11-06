import { component$, useStore, $ } from '@qwik.dev/core';
type Todo = { id: number; title: string; completed: boolean };
export const App = component$(() => {
  const state = useStore({ items: [] as Todo[], draft: '', editing: 0, editDraft: '', filter: 'all' });
  const active = state.items.filter(todo => !todo.completed);
  const visible = state.items.filter(todo => state.filter === 'all' || (state.filter === 'active' ? !todo.completed : todo.completed));
  const save = $((todo: Todo, value: string) => {
    if (state.editing !== todo.id) return;
    const title = value.trim();
    if (title) { const current = state.items.find(other => other.id === todo.id); if (current) current.title = title; }
    else state.items = state.items.filter(other => other.id !== todo.id);
    state.editing = 0;
  });
  return <section class="todoapp" data-todos={JSON.stringify(state.items)} data-filter={state.filter}>
    <header class="header"><h1>todos</h1><input class="new-todo" type="text" aria-label="New todo" placeholder="What needs to be done?" autoFocus value={state.draft}
      onInput$={(_, input) => { state.draft = input.value; }} onKeyDown$={(event, input) => {
        if (event.key !== 'Enter') return;
        const title = input.value.trim();
        if (title) state.items = [...state.items, { id: state.items.length ? state.items[state.items.length - 1].id + 1 : 1, title, completed: false }];
        state.draft = ''; input.value = '';
      }} /></header>
    <input type="hidden" data-restore onInput$={(_, input) => { state.items = JSON.parse(input.value); }} />
    <input type="hidden" data-route onInput$={(_, input) => { state.filter = input.value; }} />
    <section class="main" hidden={!state.items.length}>
      <label class="toggle-all-label"><input class="toggle-all" type="checkbox" checked={state.items.length > 0 && !active.length} onChange$={(_, input) => { state.items.forEach(todo => { todo.completed = input.checked; }); }} />Mark all as complete</label>
      <ul class="todo-list">{visible.map(todo => <li key={todo.id} data-id={todo.id} class={state.editing === todo.id ? 'editing' : todo.completed ? 'completed' : ''}>
        <div class="view"><input class="toggle" type="checkbox" aria-label="Complete todo" checked={todo.completed} onChange$={(_, input) => { const current = state.items.find(other => other.id === todo.id); if (current) current.completed = input.checked; }} />
          <button class="todo-title" type="button" aria-label="Edit todo" onClick$={() => { state.editing = todo.id; state.editDraft = todo.title; }} onDblClick$={() => { state.editing = todo.id; state.editDraft = todo.title; }}>{String(todo.title)}</button>
          <button class="destroy" type="button" aria-label="Delete todo" onClick$={() => { state.items = state.items.filter(other => other.id !== todo.id); }}>×</button></div>
        <input class="edit" type="text" aria-label="Edit todo title" value={state.editing === todo.id ? state.editDraft : todo.title} onInput$={(_, input) => { state.editDraft = input.value; }}
          onKeyDown$={(event, input) => { if (event.key === 'Enter') return save(todo, input.value); if (event.key === 'Escape') state.editing = 0; }} onFocusOut$={(_, input) => save(todo, input.value)} />
      </li>)}</ul>
    </section>
    <footer class="footer" hidden={!state.items.length}><span class="todo-count"><strong>{active.length}</strong> {active.length === 1 ? 'item' : 'items'} left</span>
      <nav class="filters" aria-label="Todo filters"><a href="#/" class={state.filter === 'all' ? 'selected' : ''}>All</a><a href="#/active" class={state.filter === 'active' ? 'selected' : ''}>Active</a><a href="#/completed" class={state.filter === 'completed' ? 'selected' : ''}>Completed</a></nav>
      <button class="clear-completed" type="button" hidden={active.length === state.items.length} onClick$={() => { state.items = state.items.filter(todo => !todo.completed); }}>Clear completed</button>
    </footer>
  </section>;
});
