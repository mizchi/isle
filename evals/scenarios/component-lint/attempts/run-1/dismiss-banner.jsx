import * as stylex from '@stylexjs/stylex';

const styles = stylex.create({
  banner: { position: 'relative', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', padding: 12, paddingRight: 48, backgroundColor: '#e8f0fe' },
  text: { fontFamily: 'Roboto', fontSize: 16, lineHeight: '24px', color: '#111' },
  close: { position: 'absolute', top: 8, right: 8, width: 32, height: 32, padding: 0, borderWidth: 0, backgroundColor: '#1a73e8' },
});

export default function Notice() {
  return (
    <div role="status" {...stylex.props(styles.banner)}>
      <p {...stylex.props(styles.text)}>Your settings were saved to your account</p>
      <button type="button" aria-label="Dismiss" {...stylex.props(styles.close)}></button>
    </div>
  );
}
