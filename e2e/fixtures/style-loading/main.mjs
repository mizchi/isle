import {boot} from 'virtual:isle-loader';
window.styleErrors=[];
window.styleApp=boot({onError:error=>window.styleErrors.push(error.message)});
