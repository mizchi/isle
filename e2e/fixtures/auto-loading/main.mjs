import { boot } from 'virtual:isle-loader';
window.loadingErrors=[];
window.loadingApp=boot({onError:error=>window.loadingErrors.push(error.message)});
