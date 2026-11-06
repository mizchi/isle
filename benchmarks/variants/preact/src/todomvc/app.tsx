import { useState } from 'preact/hooks';
type Todo = { id: number; title: string; completed: boolean };
export function App() {
  const [items, setItems] = useState<Todo[]>([]), [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(0), [editDraft, setEditDraft] = useState(''), [filter, setFilter] = useState('all');
  const active = items.filter(todo => !todo.completed);
  const visible = items.filter(todo => filter === 'all' || (filter === 'active' ? !todo.completed : todo.completed));
  const save = (todo: Todo, value: string) => {
    if (editing !== todo.id) return;
    const title = value.trim();
    setItems(title ? items.map(other => other.id === todo.id ? { ...other, title } : other) : items.filter(other => other.id !== todo.id));
    setEditing(0);
  };
  return <section class="todoapp" data-todos={JSON.stringify(items)} data-filter={filter}>
    <header class="header"><h1>todos</h1><input class="new-todo" type="text" aria-label="New todo" placeholder="What needs to be done?" autoFocus value={draft}
      onInput={event => setDraft(event.currentTarget.value)} onKeyDown={event => {
        if (event.key !== 'Enter') return;
        const title = event.currentTarget.value.trim();
        if (title) setItems([...items, { id: items.length ? items[items.length - 1].id + 1 : 1, title, completed: false }]);
        setDraft('');
      }} /></header>
    <input type="hidden" data-restore onInput={event => setItems(JSON.parse(event.currentTarget.value))} />
    <input type="hidden" data-route onInput={event => setFilter(event.currentTarget.value)} />
    <section class="main" hidden={!items.length}>
      <label class="toggle-all-label"><input class="toggle-all" type="checkbox" checked={items.length > 0 && !active.length} onChange={event => setItems(items.map(todo => ({ ...todo, completed: event.currentTarget.checked })))} />Mark all as complete</label>
      <ul class="todo-list">{visible.map(todo => <li key={todo.id} data-id={todo.id} class={editing === todo.id ? 'editing' : todo.completed ? 'completed' : ''}>
        <div class="view"><input class="toggle" type="checkbox" aria-label="Complete todo" checked={todo.completed} onChange={event => setItems(items.map(other => other.id === todo.id ? { ...other, completed: event.currentTarget.checked } : other))} />
          <button class="todo-title" type="button" aria-label="Edit todo" onClick={() => { setEditing(todo.id); setEditDraft(todo.title); }} onDblClick={() => { setEditing(todo.id); setEditDraft(todo.title); }}>{todo.title}</button>
          <button class="destroy" type="button" aria-label="Delete todo" onClick={() => setItems(items.filter(other => other.id !== todo.id))}>×</button></div>
        <input class="edit" type="text" aria-label="Edit todo title" value={editing === todo.id ? editDraft : todo.title} onInput={event => setEditDraft(event.currentTarget.value)}
          onKeyDown={event => { if (event.key === 'Enter') save(todo, event.currentTarget.value); else if (event.key === 'Escape') setEditing(0); }} onBlur={event => save(todo, event.currentTarget.value)} />
      </li>)}</ul>
    </section>
    <footer class="footer" hidden={!items.length}><span class="todo-count"><strong>{active.length}</strong> {active.length === 1 ? 'item' : 'items'} left</span>
      <nav class="filters" aria-label="Todo filters"><a href="#/" class={filter === 'all' ? 'selected' : ''}>All</a><a href="#/active" class={filter === 'active' ? 'selected' : ''}>Active</a><a href="#/completed" class={filter === 'completed' ? 'selected' : ''}>Completed</a></nav>
      <button class="clear-completed" type="button" hidden={active.length === items.length} onClick={() => setItems(active)}>Clear completed</button>
    </footer>
  </section>;
}
