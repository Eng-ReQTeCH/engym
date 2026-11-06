// Owner-controlled deployment configuration. Never read from browser storage or URL parameters.
export const PUBLIC_SERVER = 'https://engym.minaghali.xyz';
export const API_ORIGIN = ['localhost','127.0.0.1','[::1]'].includes(location.hostname) ? location.origin : PUBLIC_SERVER;
