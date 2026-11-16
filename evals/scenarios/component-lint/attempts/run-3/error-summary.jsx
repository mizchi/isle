import { css } from '@linaria/core';

const box = css`display: grid; grid-template-columns: minmax(0, 1fr); padding: 8px 12px; border: 2px solid #b3261e; background: #fff;`;
const title = css`font-size: 16px; line-height: 24px; color: #b3261e;`;
const item = css`font-size: 14px; line-height: 20px; color: #111;`;

export default function Summary() {
  return <div role="alert" className={box}><p className={title}>There is a problem</p><p className={item}>Enter your email address</p></div>;
}
