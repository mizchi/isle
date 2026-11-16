import { css } from '@linaria/core';

const banner = css`
  display: grid; grid-template-columns: minmax(0, 1fr); padding: 12px 16px; background: #fffbe6; color: #333;
  @media (prefers-color-scheme: dark) { background: #1a1a1a; }
`;
const text = css`font-size: 16px; line-height: 24px;`;

export default function Notice() {
  return <aside className={banner}><p className={text}>Maintenance on Sunday</p></aside>;
}
