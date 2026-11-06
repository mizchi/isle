import { boot } from 'virtual:isle-loader';
window.profileErrors = [];
window.isleDemo = boot({ onError: error => window.profileErrors.push(error.message) });
