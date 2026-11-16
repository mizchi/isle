import * as stylex from '@stylexjs/stylex';

const styles = stylex.create({
  list: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', rowGap: 8, padding: 16, backgroundColor: '#fff' },
  question: { display: 'block', width: '100%', padding: 12, borderWidth: 0, backgroundColor: '#f1f1f1', color: '#111', fontFamily: 'Roboto', fontSize: 16, lineHeight: '24px', textAlign: 'left' },
  panel: { padding: 12 },
  answer: { fontSize: 14, lineHeight: '20px', color: '#595959' },
});

export default function Faq() {
  return (
    <div {...stylex.props(styles.list)}>
      <button type="button" aria-expanded="true" {...stylex.props(styles.question)}>Can I cancel at any time?</button>
      <div {...stylex.props(styles.panel)}><p {...stylex.props(styles.answer)}>Yes. Cancel from the billing page and you keep access until the end of the period.</p></div>
    </div>
  );
}
