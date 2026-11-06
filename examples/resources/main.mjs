import { boot } from 'virtual:isle-loader';
boot();
document.querySelector('#remove').addEventListener('click', () => {
  document.querySelector('[data-session]')?.remove();
});
