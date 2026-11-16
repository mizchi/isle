import * as stylex from '@stylexjs/stylex';

const styles = stylex.create({
  form: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', rowGap: 12, padding: 16, backgroundColor: '#fff' },
  input: { display: 'block', height: 44, paddingTop: 0, paddingBottom: 0, paddingLeft: 12, paddingRight: 12, borderWidth: 1, borderStyle: 'solid', borderColor: '#767676', fontFamily: 'Roboto', fontSize: 16, lineHeight: '24px' },
  submit: { display: 'block', height: 44, borderWidth: 0, backgroundColor: '#1a73e8', color: '#fff', fontFamily: 'Roboto', fontSize: 16, lineHeight: '24px' },
});

export default function Login() {
  return (
    <form {...stylex.props(styles.form)}>
      <input type="email" placeholder="Email" {...stylex.props(styles.input)} />
      <input type="password" placeholder="Password" {...stylex.props(styles.input)} />
      <button type="submit" {...stylex.props(styles.submit)}>Sign in</button>
    </form>
  );
}
