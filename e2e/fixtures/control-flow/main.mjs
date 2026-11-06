import { boot } from 'virtual:isle-loader';
window.controlErrors = [];
window.mountControls = root => boot({ root, onError(error) {
  window.controlErrors.push(error.message);
  document.getElementById('errors').textContent = error.message;
} });
window.controls = window.mountControls(document);
