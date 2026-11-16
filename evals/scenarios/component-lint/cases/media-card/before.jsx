import * as stylex from '@stylexjs/stylex';

const styles = stylex.create({
  grid: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(280px, 1fr))', columnGap: 16, padding: 16 },
  card: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', rowGap: 8 },
  thumb: { width: '100%', aspectRatio: '16 / 9' },
  caption: { fontSize: 14, lineHeight: '20px', color: '#111' },
});

export default function Videos() {
  return (
    <section {...stylex.props(styles.grid)}>
      <article {...stylex.props(styles.card)}><img {...stylex.props(styles.thumb)} src="/a.jpg" alt="Intro" /><p {...stylex.props(styles.caption)}>Intro</p></article>
      <article {...stylex.props(styles.card)}><img {...stylex.props(styles.thumb)} src="/b.jpg" alt="Setup" /><p {...stylex.props(styles.caption)}>Setup</p></article>
      <article {...stylex.props(styles.card)}><img {...stylex.props(styles.thumb)} src="/c.jpg" alt="Deploy" /><p {...stylex.props(styles.caption)}>Deploy</p></article>
    </section>
  );
}
