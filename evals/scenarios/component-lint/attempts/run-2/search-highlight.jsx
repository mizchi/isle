import * as stylex from '@stylexjs/stylex';

const styles = stylex.create({
  list: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', rowGap: 8, padding: 16, backgroundColor: '#fff' },
  hit: { fontSize: 16, lineHeight: '24px', color: '#111', backgroundColor: '#fdd663' },
  rest: { fontSize: 16, lineHeight: '24px', color: '#111' },
});

export default function Results() {
  return (
    <div {...stylex.props(styles.list)}>
      <p {...stylex.props(styles.hit)}>Trail shoes</p>
      <p {...stylex.props(styles.rest)}>Lightweight shoes for rough ground</p>
    </div>
  );
}
