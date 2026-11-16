import { css } from '@linaria/core';

const card = css`position: relative; display: grid; grid-template-columns: minmax(0, 1fr); padding: 12px 12px 12px 44px; background: #fff;`;
const icon = css`position: absolute; top: 12px; left: 12px; width: 24px; height: 24px; background: #1565c0;`;
const text = css`font-size: 16px; line-height: 24px; color: #111;`;

export default function Notice() {
  return <div className={card} dir="rtl"><span className={icon} aria-hidden="true"></span><p className={text}>Saved</p></div>;
}
