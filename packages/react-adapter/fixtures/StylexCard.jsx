import * as stylex from '@stylexjs/stylex';

const styles = stylex.create({
  page: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', rowGap: 8 },
  panel: { height: 120, backgroundColor: '#eef' },
  wide: { width: 480 },
  compact: { height: 60 },
  list: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gridAutoRows: 32, padding: 0, margin: 0 },
  item: { display: 'block', backgroundColor: { default: '#fff', ':hover': '#eee' } },
});

export default function Card({ open, wide, items }) {
  return (
    <main {...stylex.props(styles.page)}>
      {open ? <section {...stylex.props(styles.panel, wide && styles.wide)} /> : <div {...stylex.props(styles.panel, styles.compact)} />}
      <ul {...stylex.props(styles.list)}>
        {items.map(item => <li key={item} {...stylex.props(styles.item)} />)}
      </ul>
    </main>
  );
}
