// Library entry: exposes the configured Hono app + the auth seam so a managed
// layer can mount the app and inject auth WITHOUT importing `server.ts` (no
// listener side effect). `server.ts` remains the OSS runnable entry.
export { api } from './routes.js';
export { authStub, setAuthenticator, type Authenticator, type AuthResult } from './auth.js';
