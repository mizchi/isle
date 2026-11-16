import * as stylex from '@stylexjs/stylex';

const styles = stylex.create({
  form: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', rowGap: 12, padding: 16, backgroundColor: '#fff' },
  input: { display: 'block', height: 44, paddingTop: 0, paddingBottom: 0, paddingLeft: 12, paddingRight: 12, borderWidth: 1, borderStyle: 'solid', borderColor: '#767676', fontFamily: 'Roboto', fontSize: 16, lineHeight: '24px' },
  label: { display: 'block', fontFamily: 'Roboto', fontSize: 14, lineHeight: '20px', color: '#111' },
  submit: { display: 'block', height: 44, borderWidth: 0, backgroundColor: '#1a73e8', color: '#fff', fontFamily: 'Roboto', fontSize: 16, lineHeight: '24px' },
});

export default function Login() {
  return (
    <form {...stylex.props(styles.form)}>
      <label htmlFor="email" {...stylex.props(styles.label)}>Email</label>
      <input id="email" type="email" {...stylex.props(styles.input)} />
      <label htmlFor="password" {...stylex.props(styles.label)}>Password</label>
      <input id="password" type="password" {...stylex.props(styles.input)} />
      <button type="submit" {...stylex.props(styles.submit)}>Sign in</button>
    </form>
  );
}
