import { css } from '@linaria/core';

const bar = css`display: flex; justify-content: space-between; padding: 16px; background: #fff;`;
const btn = css`flex: none; height: 40px; padding: 0 8px; border: 1px solid #555; background: #fff; color: #111; font-family: Roboto; font-size: 14px; line-height: 20px; white-space: nowrap;`;

export default function Nav() {
  return <div className={bar}><button className={btn} type="button">Back</button><button className={btn} type="button">Continue to payment</button></div>;
}
