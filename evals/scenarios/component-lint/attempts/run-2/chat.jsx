import * as stylex from '@stylexjs/stylex';

const styles = stylex.create({
  thread: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', rowGap: 8, padding: 16, backgroundColor: '#fff' },
  bubble: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', maxWidth: 260, padding: 12, backgroundColor: '#e8f0fe', color: '#111', fontFamily: 'Roboto', fontSize: 16, lineHeight: '24px', overflowWrap: 'anywhere' },
  mine: { justifySelf: 'end', backgroundColor: '#d2e3fc' },
});

export default function Thread() {
  return (
    <div {...stylex.props(styles.thread)}>
      <p {...stylex.props(styles.bubble)}>See you at noon</p>
      <p {...stylex.props(styles.bubble, styles.mine)}>https://example.com/reservations/confirmation</p>
    </div>
  );
}
