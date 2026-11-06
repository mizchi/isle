import { boot } from 'virtual:isle-loader';
boot({ actionBaseURL: new URL('/portable/api/actions/', location.href).href, requestCredentials: 'omit' });
