import { css } from '@linaria/core';

const field = css`display: grid; grid-template-columns: minmax(0, 1fr); row-gap: 8px; padding: 16px; background: #fff;`;
const label = css`display: block; font-size: 14px; line-height: 20px; color: #111;`;
const input = css`display: block; height: 44px; padding: 0 12px; border: 1px solid #767676; font-size: 16px; line-height: 24px;`;
const bars = css`display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); column-gap: 4px;`;
const bar = css`display: block; height: 4px; background: #e0e0e0;`;
const on = css`background: #d93025;`;
const hint = css`display: block; font-size: 13px; line-height: 18px; color: #f28b82;`;

export default function Password() {
  return (
    <div className={field}>
      <label className={label} htmlFor="pw">Password</label>
      <input className={input} id="pw" type="password" aria-describedby="pw-hint" />
      <div className={bars} aria-hidden="true"><span className={`${bar} ${on}`}></span><span className={bar}></span><span className={bar}></span><span className={bar}></span></div>
      <span className={hint} id="pw-hint">Weak: add numbers or symbols</span>
    </div>
  );
}
