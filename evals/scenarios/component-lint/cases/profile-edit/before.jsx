import { css } from '@linaria/core';

const form = css`display: grid; grid-template-columns: 200px 240px; column-gap: 16px; row-gap: 12px; align-items: center; padding: 16px; background: #fff;`;
const label = css`font-size: 16px; line-height: 24px; color: #111;`;
const field = css`display: block; width: 240px; height: 40px; padding: 0 8px; border: 1px solid #767676; font-family: Roboto; font-size: 16px; line-height: 24px;`;

export default function Profile() {
  return (
    <form className={form}>
      <label className={label} htmlFor="n">Display name</label><input className={field} id="n" />
      <label className={label} htmlFor="b">Short bio</label><input className={field} id="b" />
    </form>
  );
}
