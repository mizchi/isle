import * as stylex from '@stylexjs/stylex';

const styles = stylex.create({
  list: { display: 'flex', columnGap: 4, padding: 8, backgroundColor: '#fff' },
  tab: { flexShrink: 0, width: 110, height: 44, borderWidth: 0, backgroundColor: '#eee', color: '#111', fontFamily: 'Roboto', fontSize: 16, lineHeight: '24px' },
});

export default function Tabs() {
  return (
    <div role="tablist" {...stylex.props(styles.list)}>
      <button role="tab" type="button" {...stylex.props(styles.tab)}>Overview</button>
      <button role="tab" type="button" {...stylex.props(styles.tab)}>Activity</button>
      <button role="tab" type="button" {...stylex.props(styles.tab)}>Members</button>
      <button role="tab" type="button" {...stylex.props(styles.tab)}>Settings</button>
    </div>
  );
}
