import { css } from '@linaria/core';

const grid = css`display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 12px; padding: 16px; background: #fff;`;
const price = css`font-size: 14px; line-height: 20px; color: #111;`;

export default function Plans() {
  return <div className={grid}><p className={price}>$9 per month</p><p className={price}>$96 per year, billed once</p></div>;
}
