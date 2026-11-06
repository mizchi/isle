import './card.css';
export function setup({ root }) {
  // The loader waits for this CodeRef's stylesheet before calling setup.
  root.dataset.styleAtSetup = getComputedStyle(root).getPropertyValue('--card-ready').trim();
}
