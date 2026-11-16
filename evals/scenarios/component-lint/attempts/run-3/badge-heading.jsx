import * as stylex from '@stylexjs/stylex';

const styles = stylex.create({
  header: { position: 'relative', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', padding: 16 },
  badge: { position: 'absolute', top: 16, left: 16, width: 48, height: 24, backgroundColor: '#d00', color: '#fff', fontSize: 12, lineHeight: '24px' },
  title: { fontSize: 24, lineHeight: '32px', paddingLeft: 64 },
});

export default function Header() {
  return (
    <header {...stylex.props(styles.header)}>
      <span {...stylex.props(styles.badge)}>NEW</span>
      <h2 {...stylex.props(styles.title)}>Spring collection</h2>
    </header>
  );
}
