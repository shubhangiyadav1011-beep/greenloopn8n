import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { emailAddress, passwordHash, passwordMatches, requireThat, text } from '../validation.mjs';

const digest = value => createHash('sha256').update(value).digest('hex');

export function createAuthService({ userModel, sessionModel, datasetModel, dataDir, production, adminModel }) {
  const withSystemRole = user => ({ ...user, ...(adminModel.roleFor(user.id) ? { systemRole: adminModel.roleFor(user.id) } : {}) });
  const createSession = (user, remember = false) => {
    sessionModel.removeExpired(Date.now());
    const token = randomBytes(32).toString('hex');
    sessionModel.create(digest(token), user.id, Date.now() + (remember ? 30 : 1) * 86400000);
    return { user, cookie: `gl_session=${token}; HttpOnly; SameSite=Lax; Path=/${production ? '; Secure' : ''}${remember ? '; Max-Age=2592000' : ''}` };
  };
  const failCallback = error => ({
    status: 302,
    redirect: `/sign-in?error=${encodeURIComponent(error.status ? error.message : 'Google sign-in is unavailable. Please try again.')}`,
  });

  return {
    authenticate(req) {
      const token = /(?:^|;\s*)gl_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie ?? '')?.[1];
      const row = token && sessionModel.findUser(digest(token), Date.now());
      requireThat(row, 'Please sign in to continue.', 401);
      const user = userModel.toProfile(row);
      requireThat(adminModel.statusFor(user.id) === 'active', 'This account is suspended. Contact GreenLoop support.', 403);
      return withSystemRole(user);
    },
    async handle(path, req, body, url) {
      if (path === '/api/config' && req.method === 'GET') {
        return { status: 200, body: { googleEnabled: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET), developmentMail: !production && !process.env.EMAIL_WEBHOOK_URL } };
      }
      if (path === '/api/auth/google' && req.method === 'GET') {
        requireThat(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET, 'Google sign-in is not configured. Please use email and password.', 503);
        const state = randomBytes(32).toString('hex');
        const verifier = randomBytes(32).toString('base64url');
        sessionModel.createOAuthState(digest(state), verifier, Date.now() + 600000);
        const redirectUri = `${process.env.PUBLIC_ORIGIN ?? 'http://localhost:5173'}/api/auth/google/callback`;
        const query = new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, redirect_uri: redirectUri, response_type: 'code', scope: 'openid email profile', state, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' });
        return { status: 302, redirect: `https://accounts.google.com/o/oauth2/v2/auth?${query}`, headers: { 'Set-Cookie': `gl_oauth=${state}; HttpOnly; SameSite=Lax; Path=/; Max-Age=600${production ? '; Secure' : ''}` } };
      }
      if (path === '/api/auth/google/callback' && req.method === 'GET') {
        try {
          const state = url.searchParams.get('state');
          const cookieState = /(?:^|;\s*)gl_oauth=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie ?? '')?.[1];
          requireThat(state && cookieState && state === cookieState, 'Google sign-in session is invalid. Please try again.', 400);
          const request = sessionModel.findOAuthState(digest(state), Date.now());
          requireThat(request, 'Google sign-in session expired.', 400);
          sessionModel.deleteOAuthState(digest(state));
          requireThat(url.searchParams.get('code'), 'Google sign-in was cancelled.', 400);
          const redirectUri = `${process.env.PUBLIC_ORIGIN ?? 'http://localhost:5173'}/api/auth/google/callback`;
          const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body: new URLSearchParams({ code: url.searchParams.get('code'), client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, redirect_uri: redirectUri, grant_type: 'authorization_code', code_verifier: request.verifier }), signal: AbortSignal.timeout(10000) });
          requireThat(response.ok, 'Google sign-in could not be completed.', 400);
          const tokens = await response.json();
          const info = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${tokens.access_token}` }, signal: AbortSignal.timeout(10000) });
          requireThat(info.ok, 'Could not retrieve your Google account.', 400);
          const account = await info.json();
          requireThat(account.email_verified === true && account.sub, 'Use a verified Google account.', 400);
          const user = datasetModel.transaction(() => {
            const identity = userModel.findByGoogleSubject(account.sub);
            if (identity) return userModel.toProfile(identity);
            const email = emailAddress(account.email);
            requireThat(!userModel.hasEmail(email), 'This email already has a password account. Please sign in with your password.', 409);
            const id = randomUUID();
            const fields = { name: text(account.name ?? '', 'name', 250, true), workspaces: [] };
            userModel.createGoogleIdentity(account.sub, { id, email, profile: fields });
            return { id, email, ...fields };
          });
          const activeUser = withSystemRole(user);
          requireThat(adminModel.statusFor(activeUser.id) === 'active', 'This account is suspended. Contact GreenLoop support.', 403);
          const authenticated = createSession(activeUser, true);
          return { status: 302, redirect: user.workspaces.length ? '/app' : '/onboarding', headers: { 'Set-Cookie': authenticated.cookie } };
        } catch (error) {
          return failCallback(error);
        }
      }
      if (path === '/api/auth/me' && req.method === 'GET') {
        let user = null;
        try { user = this.authenticate(req); } catch { /* No active session. */ }
        return { status: 200, body: { user } };
      }
      if (path === '/api/auth/register' && req.method === 'POST') {
        const email = emailAddress(body.email);
        const password = passwordHash(body.password);
        requireThat(!userModel.hasEmail(email), 'An account already exists with this email.', 409);
        const user = { id: randomUUID(), email, name: text(body.name ?? '', 'name', 250, true), organization: text(body.organization ?? '', 'organization', 250, true), workspaces: [] };
        const { id, email: ignored, ...fields } = user;
        userModel.create({ id, email, password, profile: fields });
        const activeUser = withSystemRole(user);
        const authenticated = createSession(activeUser);
        return { status: 201, body: { user: authenticated.user }, headers: { 'Set-Cookie': authenticated.cookie } };
      }
      if (path === '/api/auth/login' && req.method === 'POST') {
        const email = emailAddress(body.email);
        const row = userModel.findByEmail(email);
        requireThat(passwordMatches(body.password, row?.password ?? `00000000000000000000000000000000:${'0'.repeat(128)}`) && row, 'Email or password is incorrect.', 401);
        requireThat(adminModel.statusFor(row.id) === 'active', 'This account is suspended. Contact GreenLoop support.', 403);
        const user = withSystemRole(userModel.toProfile(row));
        const authenticated = createSession(user, body.remember === true);
        return { status: 200, body: { user: authenticated.user }, headers: { 'Set-Cookie': authenticated.cookie } };
      }
      if (path.startsWith('/api/auth/demo-switch/') && req.method === 'GET' && !production) {
        const role = path.split('/')[4];
        const email = role === 'provider' ? 'provider@greenloop.demo' : 'receiver@greenloop.demo';
        const row = userModel.findByEmail(email);
        if (row) {
          const user = withSystemRole(userModel.toProfile(row));
          const authenticated = createSession(user, true);
          return { status: 302, redirect: '/app', headers: { 'Set-Cookie': authenticated.cookie } };
        }
      }
      if (path === '/api/auth/logout' && req.method === 'POST') {
        const token = /gl_session=([a-f0-9]{64})/.exec(req.headers.cookie ?? '')?.[1];
        if (token) sessionModel.delete(digest(token));
        return { status: 200, body: { ok: true }, headers: { 'Set-Cookie': `gl_session=; HttpOnly; SameSite=Lax; Path=/${production ? '; Secure' : ''}; Max-Age=0` } };
      }
      if (path === '/api/auth/forgot-password' && req.method === 'POST') {
        const email = emailAddress(body.email);
        const row = userModel.findByEmail(email);
        requireThat(!production || process.env.EMAIL_WEBHOOK_URL, 'Password recovery email is not configured.', 503);
        if (row) {
          const token = randomBytes(32).toString('hex');
          const link = `${process.env.PUBLIC_ORIGIN ?? 'http://localhost:5173'}/forgot-password?token=${token}`;
          sessionModel.createReset(digest(token), row.id, Date.now() + 1800000);
          const message = { to: email, subject: 'Reset your GreenLoop password', text: `Open this link within 30 minutes: ${link}` };
          if (process.env.EMAIL_WEBHOOK_URL) {
            const response = await fetch(process.env.EMAIL_WEBHOOK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(process.env.EMAIL_WEBHOOK_TOKEN ? { Authorization: `Bearer ${process.env.EMAIL_WEBHOOK_TOKEN}` } : {}) }, body: JSON.stringify(message), signal: AbortSignal.timeout(10000) });
            requireThat(response.ok, 'Could not send recovery email. Try again later.', 503);
          } else {
            appendFileSync(resolve(dataDir, 'mail-outbox.jsonl'), JSON.stringify(message) + '\n');
          }
        }
        return { status: 200, body: { ok: true } };
      }
      if (path === '/api/auth/reset-password' && req.method === 'POST') {
        text(body.token, 'reset token', 128);
        const password = passwordHash(body.password);
        datasetModel.transaction(() => {
          const reset = sessionModel.findReset(digest(body.token), Date.now());
          requireThat(reset, 'This reset link is invalid or expired.', 400);
          userModel.updatePassword(reset.user_id, password);
          sessionModel.deleteForUser(reset.user_id);
          sessionModel.deleteResetsForUser(reset.user_id);
        });
        return { status: 200, body: { ok: true } };
      }
      return undefined;
    },
  };
}
