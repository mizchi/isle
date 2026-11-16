import { css } from '@linaria/core';

const card = css`position: relative; display: grid; grid-template-columns: minmax(0, 1fr); height: 72px; padding: 16px; border-radius: 8px; background: #fff;`;
const title = css`display: block; font-size: 16px; line-height: 24px; color: #111;`;
const menu = css`position: absolute; top: 48px; right: 16px; display: grid; grid-template-columns: minmax(0, 1fr); width: 160px; height: 96px; padding: 8px 0; background: #fff; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);`;
const item = css`display: block; padding: 8px 16px; font-size: 16px; line-height: 24px; color: #111;`;

export default function Card({ open }) {
  return (
    <div className={card}>
      <span className={title}>Quarterly report</span>
      {open && <div className={menu} role="menu"><a className={item} role="menuitem" href="/share">Share</a><a className={item} role="menuitem" href="/delete">Delete</a></div>}
    </div>
  );
}
