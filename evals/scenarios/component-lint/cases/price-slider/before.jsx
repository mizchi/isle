import { css } from '@linaria/core';

const row = css`display: grid; grid-template-columns: 120px 160px 120px; column-gap: 12px; align-items: center; padding: 16px; background: #fff;`;
const value = css`font-size: 16px; line-height: 24px; color: #111;`;
const slider = css`display: block; width: 160px; height: 24px; margin: 0;`;

export default function Price() {
  return <div className={row}><span className={value}>Min $10</span><input className={slider} type="range" aria-label="Price" /><span className={value}>Max $500</span></div>;
}
