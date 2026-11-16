import * as stylex from '@stylexjs/stylex';

const styles = stylex.create({
  group: { display: 'grid', gridTemplateColumns: 'repeat(3, 96px)', columnGap: 4, padding: 4, backgroundColor: '#f1f3f4' },
  option: { display: 'block', height: 36, paddingTop: 0, paddingBottom: 0, paddingLeft: 12, paddingRight: 12, borderWidth: 0, whiteSpace: 'nowrap', fontFamily: 'Roboto', fontSize: 14, lineHeight: '20px', color: '#3c4043', backgroundColor: 'transparent' },
  selected: { color: '#174ea6', backgroundColor: '#fff' },
});

export default function Range({ range }) {
  return (
    <div role="radiogroup" aria-label="Range" {...stylex.props(styles.group)}>
      <button type="button" role="radio" aria-checked={range === 'day'} {...stylex.props(styles.option, range === 'day' && styles.selected)}>Day</button>
      <button type="button" role="radio" aria-checked={range === 'week'} {...stylex.props(styles.option, range === 'week' && styles.selected)}>Week</button>
      <button type="button" role="radio" aria-checked={range === 'month'} {...stylex.props(styles.option, range === 'month' && styles.selected)}>30 days</button>
    </div>
  );
}
