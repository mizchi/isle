import { css, cx } from '@linaria/core';
import { styled } from '@linaria/react';

// Module constants the templates interpolate (Linaria evaluates them at build time).
const theme = { ink: '#111', paper: '#fff', accent: '#246', line: '#ddd' };
const gap = '8px';
const control = 96;

const page = css`display: grid; grid-template-columns: minmax(0, 1fr); row-gap: ${gap}; background: ${theme.paper}; color: ${theme.ink};`;
const bar = css`position: sticky; top: 0; display: grid; grid-template-columns: minmax(0, 1fr); height: 48px;`;
const title = css`display: block; line-height: 24px; padding-left: 16px;`;
const actions = css`display: flex; column-gap: ${gap};`;
const Save = styled.button`appearance: none; display: block; padding: 0; border: 0; min-width: 0; min-height: 0; width: ${control}px; height: 40px; background: ${theme.accent};`;
const reset = css`appearance: none; display: block; padding: 0; border: 0; min-width: 0; min-height: 0; width: ${control}px; height: 40px; background: ${theme.accent};`;
const wide = css`grid-column: span 2;`;
const check = css`display: grid; grid-template-columns: 24px;`;
const box = css`appearance: none; display: block; padding: 0; border: 1px solid #000; min-width: 0; min-height: 0; width: 24px; height: 24px; margin: 0;`;
const hidden = css`display: none;`;
const mark = css`display: block; height: 24px; background: #ccc;`;
const toast = css`display: block; height: 32px; background: #eef;`;
const wrap = css`display: grid; grid-template-columns: minmax(0, 1fr); overflow-x: auto;`;
const thead = css`position: sticky; top: 0; height: 32px; background: ${theme.line};`;
// A class reference in a selector: Linaria inserts the bare class name, so it is written .${wrap}.
const row = css`display: block; height: 32px; .${wrap} > & { color: ${theme.ink}; }`;

export default function Settings({ saved, agree, wideSave, rows }) {
  return (
    <main className={page}>
      <header className={bar}><span className={title}>Settings</span></header>
      <div className={actions}>
        <Save className={cx(wideSave && wide)} aria-label="Save" />
        <button className={reset} aria-label="Reset" />
      </div>
      <label className={check}>
        <input className={cx(box, !agree && hidden)} type="checkbox" />
        <span className={mark} />
      </label>
      {saved && <div className={toast} role="status" />}
      <div className={wrap}>
        <div className={thead} />
        {rows.map(r => <div key={r} className={row} />)}
      </div>
    </main>
  );
}
