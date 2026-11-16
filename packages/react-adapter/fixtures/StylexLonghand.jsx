import * as stylex from '@stylexjs/stylex';

// A shorthand and its longhand in one stylex.create entry, in both orders, and across two merged entries.
const styles = stylex.create({
  page: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', rowGap: 8 },
  after: { display: 'block', height: 20, padding: 16, paddingBottom: 40 },
  before: { display: 'block', height: 20, paddingBottom: 40, padding: 16 },
  base: { display: 'block', height: 20, margin: 0, padding: 10 },
  extra: { paddingLeft: 30, marginTop: 12 },
});

export default function Longhand({ wide }) {
  return (
    <main {...stylex.props(styles.page)}>
      <div {...stylex.props(styles.after)} />
      <div {...stylex.props(styles.before)} />
      <div {...stylex.props(styles.base, wide && styles.extra)} />
      <div {...stylex.props(styles.extra, styles.base)} />
    </main>
  );
}
