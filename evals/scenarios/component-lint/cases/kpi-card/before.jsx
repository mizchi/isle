import { css } from '@linaria/core';

const grid = css`display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; padding: 16px; background: #f1f3f4;`;
const card = css`display: grid; grid-template-columns: minmax(0, 1fr); row-gap: 4px; padding: 12px; background: #fff;`;
const label = css`display: block; font-size: 13px; line-height: 18px; color: #5f6368;`;
const value = css`display: block; white-space: nowrap; font-size: 32px; line-height: 40px; color: #202124;`;

export default function Kpis() {
  return (
    <div className={grid}>
      <div className={card}><span className={label}>Revenue</span><span className={value}>$1,284,900</span></div>
      <div className={card}><span className={label}>Orders</span><span className={value}>18,204</span></div>
    </div>
  );
}
