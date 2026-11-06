import { boot } from 'virtual:isle-loader';
window.resourceErrors = [];
window.resourceApp = boot({ onError(error) { window.resourceErrors.push(error.message); } });
