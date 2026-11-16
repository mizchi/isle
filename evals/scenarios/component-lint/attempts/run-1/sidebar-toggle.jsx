import * as stylex from '@stylexjs/stylex';

const styles = stylex.create({
  shell: { display: 'grid', gridTemplateColumns: '220px minmax(0, 1fr)', backgroundColor: '#fff' },
  collapsed: { gridTemplateColumns: '56px minmax(0, 1fr)' },
  nav: { position: 'relative', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', rowGap: 4, padding: 8, backgroundColor: '#f1f3f4' },
  link: { display: 'block', color: '#0b57d0', fontSize: 16, lineHeight: '24px', whiteSpace: 'nowrap' },
  rail: { position: 'absolute', top: 0, left: 0, width: 1, height: 1, overflow: 'hidden', clipPath: 'inset(50%)' },
  main: { padding: 16, color: '#111', fontSize: 16, lineHeight: '24px' },
});

export default function Shell({ collapsed }) {
  return (
    <div {...stylex.props(styles.shell, collapsed && styles.collapsed)}>
      <nav aria-label="Main" {...stylex.props(styles.nav)}><a href="/inbox" {...stylex.props(styles.link, collapsed && styles.rail)}>Inbox messages</a></nav>
      <main {...stylex.props(styles.main)}><p>Welcome</p></main>
    </div>
  );
}
