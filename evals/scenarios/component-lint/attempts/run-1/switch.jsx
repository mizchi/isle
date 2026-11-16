import { css } from '@linaria/core';

const row = css`display: grid; grid-template-columns: minmax(0, 1fr) 48px; column-gap: 12px; align-items: center; padding: 12px 16px; background: #fff;`;
const label = css`font-size: 16px; line-height: 24px; color: #111;`;
const sw = css`width: 48px; height: 28px; border: 2px solid #555; background: #e0e0e0;`;

export default function Setting() {
  return <div className={row}><span className={label} id="wifi">Wi-Fi</span><div className={sw} role="switch" aria-checked="false" tabIndex={0} aria-labelledby="wifi"></div></div>;
}
