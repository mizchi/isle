export function setup({ root, owner }) {
  const status = document.querySelector('#lifecycle');
  let ticks = 0;
  status.textContent = 'Active';
  status.dataset.state = 'active';
  const timer = setInterval(() => { status.textContent = `Active: ${++ticks} ticks`; }, 1000);
  owner.own(timer, clearInterval);
  const entered = () => { root.dataset.entered = 'true'; };
  root.addEventListener('pointerenter', entered);
  owner.own(root, element => {
    element.removeEventListener('pointerenter', entered);
    status.textContent = 'Disposed: timer and listener released';
    status.dataset.state = 'disposed';
    status.dataset.cleanups = String(Number(status.dataset.cleanups ?? 0) + 1);
  });
}
