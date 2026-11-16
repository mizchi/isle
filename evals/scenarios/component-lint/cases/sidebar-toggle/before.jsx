import * as stylex from '@stylexjs/stylex';

const styles = stylex.create({
  shell: { display: 'grid', gridTemplateColumns: '220px minmax(0, 1fr)', backgroundColor: '#fff' },
  collapsed: { gridTemplateColumns: '56px minmax(0, 1fr)' },
  nav: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', rowGap: 4, padding: 8, backgroundColor: '#f1f3f4' },
  link: { display: 'block', color: '#0b57d0', fontSize: 16, lineHeight: '24px', whiteSpace: 'nowrap' },
  main: { padding: 16, color: '#111', fontSize: 16, lineHeight: '24px' },
});

export default function Shell({ collapsed }) {
  return (
    <div {...stylex.props(styles.shell, collapsed && styles.collapsed)}>
      <nav aria-label="Main" {...stylex.props(styles.nav)}><a href="/inbox" {...stylex.props(styles.link)}>Inbox messages</a></nav>
      <main {...stylex.props(styles.main)}><p>Welcome</p></main>
    </div>
  );
}
