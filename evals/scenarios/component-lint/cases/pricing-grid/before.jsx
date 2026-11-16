import { css } from '@linaria/core';

const gap = '16px';
const grid = css`display: grid; grid-template-columns: repeat(3, 240px); column-gap: ${gap}; padding: 16px;`;
const plan = css`display: grid; grid-template-columns: minmax(0, 1fr); row-gap: 8px; padding: 16px; border: 1px solid #ccc;`;
const name = css`font-size: 20px; line-height: 28px;`;
const price = css`font-size: 16px; line-height: 24px;`;

export default function Pricing() {
  return (
    <section className={grid}>
      <div className={plan}><h3 className={name}>Free</h3><p className={price}>$0</p></div>
      <div className={plan}><h3 className={name}>Pro</h3><p className={price}>$12</p></div>
      <div className={plan}><h3 className={name}>Team</h3><p className={price}>$30</p></div>
    </section>
  );
}
