import * as stylex from '@stylexjs/stylex';

const styles = stylex.create({
  thread: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', rowGap: 12, padding: 16, backgroundColor: '#fff' },
  comment: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', padding: 12, borderWidth: 0, backgroundColor: '#f8f9fa' },
  reply: { marginLeft: 280 },
  text: { fontFamily: 'Roboto', fontSize: 16, lineHeight: '24px', color: '#111' },
});

export default function Thread() {
  return (
    <div {...stylex.props(styles.thread)}>
      <article {...stylex.props(styles.comment)}><p {...stylex.props(styles.text)}>Great article</p></article>
      <article {...stylex.props(styles.comment, styles.reply)}><p {...stylex.props(styles.text)}>Agreed, thanks</p></article>
    </div>
  );
}
