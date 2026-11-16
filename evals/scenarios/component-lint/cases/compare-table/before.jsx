import { css } from '@linaria/core';

const table = css`border-collapse: collapse; background: #fff;`;
const th = css`padding: 8px; font-size: 14px; line-height: 20px; color: #999; background: #f5f5f5; text-align: left; white-space: nowrap;`;
const td = css`padding: 8px; font-size: 14px; line-height: 20px; color: #111; white-space: nowrap;`;

export default function Compare() {
  return (
    <table className={table}>
      <thead><tr><th className={th}>Plan</th><th className={th}>Price</th></tr></thead>
      <tbody><tr><td className={td}>Basic</td><td className={td}>$5</td></tr></tbody>
    </table>
  );
}
