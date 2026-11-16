import { css } from '@linaria/core';

const table = css`border-collapse: collapse; background: #fff;`;
const th = css`padding: 8px; font-size: 14px; line-height: 20px; color: #111; text-align: left;`;
const sort = css`width: 24px; height: 24px; padding: 0; border: 0; background: #ddd;`;
const td = css`padding: 8px; font-size: 14px; line-height: 20px; color: #111;`;

export default function Orders() {
  return (
    <table className={table}>
      <thead><tr><th className={th}><button className={sort} type="button"></button></th><th className={th}>Total</th></tr></thead>
      <tbody><tr><td className={td}>A-1</td><td className={td}>$12</td></tr></tbody>
    </table>
  );
}
