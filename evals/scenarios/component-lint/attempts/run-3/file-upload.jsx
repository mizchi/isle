import * as stylex from '@stylexjs/stylex';

const styles = stylex.create({
  box: { position: 'relative', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', rowGap: 8, padding: 16, backgroundColor: '#fff' },
  label: { display: 'block', height: 24, color: '#0b57d0', fontSize: 14, lineHeight: '24px' },
  input: { appearance: 'none', display: 'block', boxSizing: 'border-box', minWidth: 0, minHeight: 0, padding: 0, borderWidth: 0, position: 'absolute', top: 0, left: 0, width: 1, height: 1, overflow: 'hidden', clipPath: 'inset(50%)', whiteSpace: 'nowrap' },
  hint: { fontSize: 14, lineHeight: '20px', color: '#444' },
});

export default function Upload() {
  return (
    <div {...stylex.props(styles.box)}>
      <label htmlFor="f" {...stylex.props(styles.label)}>Choose a file</label>
      <input id="f" type="file" {...stylex.props(styles.input)} />
      <p {...stylex.props(styles.hint)}>PDF up to 10 MB</p>
    </div>
  );
}
