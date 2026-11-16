import { css } from '@linaria/core';

const grid = css`display: grid; grid-template-columns: 120px 120px; column-gap: 12px; padding: 16px; background: #fff;`;
const price = css`font-size: 14px; line-height: 20px; color: #111; white-space: nowrap;`;

export default function Plans() {
  return <div className={grid}><p className={price}>$9 per month</p><p className={price}>$96 per year, billed once</p></div>;
}
