import { css } from '@linaria/core';

const row = css`display: grid; grid-template-columns: minmax(0, 1fr); row-gap: 4px; padding: 16px; background: #fff;`;
const label = css`font-size: 16px; line-height: 24px; color: #111; white-space: nowrap;`;
const input = css`display: block; width: 200px; height: 40px; padding: 0 8px; border: 1px solid #767676; font-family: Roboto; font-size: 16px; line-height: 24px;`;

export default function DateField() {
  return <div className={row}><label className={label} htmlFor="d">Delivery date</label><input className={input} id="d" type="date" /></div>;
}
