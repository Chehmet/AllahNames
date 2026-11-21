import { config } from './config.js';
import { read, save } from './ui.js';

export const enabled = Boolean(config.url && config.key);
const base = config.url.replace(/\/$/, '');
const sessionKey = 'session.' + base;
const verifierKey = 'email-verifier.' + base;
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

export async function sendSignInEmail(email, redirectTo) {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const verifier = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const params = new URLSearchParams({ redirect_to: redirectTo });
  await request('/auth/v1/otp?' + params, {
    body: { email, create_user: true, code_challenge: challenge, code_challenge_method: 's256' }
  });
  save(verifierKey, verifier);
}

export function emailLink(address) {
  const url = new URL(address);
  const fragment = new URLSearchParams(url.hash.slice(1));
  const code = url.searchParams.get('code');
  const fragmentError = fragment.has('error') || fragment.has('error_code');
  const legacyLink = fragment.has('access_token') || fragment.has('refresh_token');
  if (!url.searchParams.has('code') && !url.searchParams.has('error') && !url.searchParams.has('error_code')
      && !fragmentError && !legacyLink) return null;
  for (const key of ['code', 'error', 'error_code', 'error_description']) url.searchParams.delete(key);
  if (fragmentError || legacyLink) url.hash = '';
  return { code, address: url.href };
}

export async function signInFromLink(code) {
  if (!code) throw new Error('Email link is invalid or expired');
  const verifier = read(verifierKey, null);
  if (!verifier) {
    const error = new Error('Email link opened in a different browser');
    error.code = 'missing_verifier';
    throw error;
  }
  const result = await request('/auth/v1/token?grant_type=pkce', {
    body: { auth_code: code, code_verifier: verifier }
  });
  const active = receive(result);
  if (read(verifierKey, null) === verifier) save(verifierKey, null);
  return active;
}

export async function verifyCode(email, token) {
  const result = await request('/auth/v1/verify', { body: { email, token, type: 'email' } });
  const active = receive(result);
  save(verifierKey, null);
  return active;
}

export async function signout() {
  try {
    const current = await refresh();
    if (current) await request('/auth/v1/logout?scope=local', { token: current.access_token });
  } finally {
    storeSession(null);
    save(verifierKey, null);
  }
}

export async function rpc(name, body = {}) {
  const current = await refresh();
  if (!current) throw new Error('Sign in required');
  return request('/rest/v1/rpc/aq_' + name, { body, token: current.access_token });
}
