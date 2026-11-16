import * as stylex from '@stylexjs/stylex';

const styles = stylex.create({
  page: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', rowGap: 12, padding: 16, paddingBottom: 80, backgroundColor: '#fff' },
  text: { fontSize: 16, lineHeight: '24px', color: '#111' },
  photo: { width: '100%', height: 900, backgroundColor: '#ddd' },
  toast: { position: 'fixed', left: 0, right: 0, bottom: 0, height: 64, padding: 16, backgroundColor: '#222', color: '#fff', fontSize: 16, lineHeight: '24px' },
});

export default function Page() {
  return (
    <main {...stylex.props(styles.page)}>
      <p {...stylex.props(styles.text)}>Your order has shipped.</p>
      <div {...stylex.props(styles.photo)} />
      <p {...stylex.props(styles.text)}>Track it from your account page.</p>
      <div role="status" {...stylex.props(styles.toast)}>Saved</div>
    </main>
  );
}
