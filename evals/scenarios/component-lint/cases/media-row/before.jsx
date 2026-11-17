import * as stylex from '@stylexjs/stylex';

const styles = stylex.create({
  row: { display: 'grid', gridTemplateColumns: '120px minmax(0, 1fr)', columnGap: 12, alignItems: 'start', padding: 12, backgroundColor: '#fff' },
  thumb: { display: 'block', width: 120, aspectRatio: '16 / 9', backgroundColor: '#dadce0' },
  title: { display: 'block', fontFamily: 'Roboto', fontSize: 16, lineHeight: '22px', color: '#202124', whiteSpace: 'nowrap' },
});

export default function MediaRow() {
  return (
    <article {...stylex.props(styles.row)}>
      <div role="img" aria-label="Video thumbnail" {...stylex.props(styles.thumb)}></div>
      <h3 {...stylex.props(styles.title)}>Designing resilient layouts for every screen</h3>
    </article>
  );
}
