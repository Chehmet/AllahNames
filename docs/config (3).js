import { config } from './config.js';
import { read, save } from './ui.js';

export const enabled = Boolean(config.url && config.key);
const base = config.url.replace(/\/$/, '');
const sessionKey = 'session.' + base;
let session = enabled ? read(sessionKey, null) : null;
let refreshing;
let signingIn;

export const account = () => session?.user?.email && !session.user.is_anonymous ? session.user : null;
export const identity = () => session?.user?.id ?? null;

function storeSession(value) {
  session = value;
  save(sessionKey, value);
  return value;
}

async function request(path, { method = 'POST', body, token } = {}) {
  const response = await fetch(base + path, {
    method,
    headers: {
      apikey: config.key,
      ...(token && { Authorization: `Bearer ${token}` }),
      ...(body !== undefined && { 'Content-Type': 'application/json' })
    },
    ...(body !== undefined && { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(10000)
  });
  const result = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(result?.message || result?.msg || result?.error_description || 'Request failed');
    error.code = result?.error_code || result?.code || '';
    error.status = response.status;
    throw error;
  }
  return result;
}

function receive(result) {
  const data = result?.session || result;
  if (!data?.access_token || !data.user?.id) throw new Error('Invalid session');
  return storeSession({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    user: data.user,
    expires_at: data.expires_at || Math.floor(Date.now() / 1000) + data.expires_in
  });
}

async function refresh() {
  const previous = session;
  if (!previous) return null;
  if (previous.expires_at > Date.now() / 1000 + 40) return previous;
  if (!refreshing) {
    refreshing = request('/auth/v1/token?grant_type=refresh_token', {
      body: { refresh_token: previous.refresh_token }
    }).then(result => session === previous ? receive(result) : session).catch(error => {
      if (error.status === 400 || error.status === 401) {
        if (session === previous) storeSession(null);
        return session;
      }
      throw error;
    }).finally(() => { refreshing = null; });
  }
  return refreshing;
}

export async function guest() {
  const current = await refresh();
  if (current) return current;
  if (!signingIn) {
    signingIn = request('/auth/v1/signup', { body: { data: {} } })
      .then(receive).finally(() => { signingIn = null; });
  }
  return signingIn;
}

export const sendCode = email => request('/auth/v1/otp', { body: { email, create_user: true } });
export const verifyCode = (email, token) =>
  request('/auth/v1/verify', { body: { email, token, type: 'email' } }).then(receive);

export async function signout() {
  try {
    const current = await refresh();
    if (current) await request('/auth/v1/logout?scope=local', { token: current.access_token });
  } finally {
    storeSession(null);
  }
}

export async function rpc(name, body = {}) {
  const current = await refresh();
  if (!current) throw new Error('Sign in required');
  return request('/rest/v1/rpc/aq_' + name, { body, token: current.access_token });
}
