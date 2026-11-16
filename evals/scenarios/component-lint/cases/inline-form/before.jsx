import { css } from '@linaria/core';

const row = css`display: flex; align-items: center; column-gap: 8px; padding: 8px 16px; background: #fff; font-size: 14px; line-height: 20px; color: #333;`;
const input = css`display: block; flex: 0 0 240px; height: 32px; padding: 0 8px; border: 1px solid #767676; font: inherit;`;

export default function Coupon() {
  return (
    <label className={row}>Coupon code<input className={input} type="text" /></label>
  );
}
