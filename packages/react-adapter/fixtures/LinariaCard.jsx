import { css, cx } from '@linaria/core';
import { styled } from '@linaria/react';

const page = css`display: grid; grid-template-columns: minmax(0, 1fr); row-gap: 8px;`;
const panel = css`height: 120px; &.active { background: #eef; } @media (min-width: 600px) { height: 80px; }`;
const Save = styled.button`appearance: none; display: block; padding: 0; border: 0; min-width: 0; min-height: 0; height: 40px; width: 120px;`;
const wide = css`width: 480px;`;

export default function Card({ open, saving, big }) {
  return (
    <main className={page}>
      {open && <section className={cx(panel, saving && 'active', big && wide)} />}
      <Save aria-label="Save" />
    </main>
  );
}
