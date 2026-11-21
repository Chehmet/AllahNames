import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { config } from '../docs/config.js';

test('cloud client handles links and codes, refreshes once for concurrent calls, and supports anonymous players', async context => {
  config.url = 'https://example.test/';
  config.key = 'sb_publishable_test_value';
  const data = new Map();
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: key => data.get(key),
    setItem: (key, value) => data.set(key, value)
  } });
  context.after(() => originalStorage ? Object.defineProperty(globalThis, 'localStorage', originalStorage)
    : Reflect.deleteProperty(globalThis, 'localStorage'));
  const user = { id: 'host-id', email: 'host@example.test', is_anonymous: false };
  const guest = { id: 'player-id', is_anonymous: true };
  const received = [];
  const redirect = 'https://chehmet.github.io/AllahNames/';
  let challenge;
  const response = (identity, tag, expiry) => ({
    user: identity, access_token: 'token-' + tag, refresh_token: 'refresh-' + tag, expires_in: expiry
  });
  context.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.ok(url.startsWith('https://example.test/'));
    assert.equal(options.headers.apikey, config.key);
    const path = new URL(url).pathname;
    const body = options.body && JSON.parse(options.body);
    received.push(path);
    switch (path) {
      case '/auth/v1/otp':
        assert.equal(new URL(url).searchParams.get('redirect_to'), redirect);
        assert.equal(body.email, user.email);
        assert.equal(body.create_user, true);
        assert.equal(body.code_challenge_method, 's256');
        assert.match(body.code_challenge, /^[\w-]{43}$/);
        challenge = body.code_challenge;
        return Response.json({});
      case '/auth/v1/verify':
        if (body.token === '000000') return Response.json({ msg: 'Expired code' }, { status: 403 });
        assert.deepEqual(body, { email: user.email, type: 'email', token: '112233' });
        return Response.json(response(user, 'initial', 0));
      case '/auth/v1/token':
        if (new URL(url).searchParams.get('grant_type') === 'pkce') {
          assert.match(body.code_verifier, /^[0-9a-f]{64}$/);
          assert.equal(createHash('sha256').update(body.code_verifier).digest('base64url'), challenge);
          if (body.auth_code === 'expired') return Response.json({ error_code: 'flow_state_expired' }, { status: 400 });
          assert.equal(body.auth_code, 'from-email');
          return Response.json(response(user, 'from-link', 3600));
        }
        assert.deepEqual(body, { refresh_token: 'refresh-initial' });
        return Response.json(response(user, 'fresh', 3600));
      case '/rest/v1/rpc/aq_sync_favorites':
        assert.equal(options.headers.Authorization, 'Bearer token-fresh');
        assert.ok(Array.isArray(body.p_ids));
        return Response.json(body.p_ids);
      case '/auth/v1/logout':
        assert.equal(options.headers.Authorization, 'Bearer token-fresh');
        return new Response(null, { status: 204 });
      case '/auth/v1/signup':
        assert.deepEqual(body, { data: {} });
        return Response.json(response(guest, 'guest', 3600));
      default:
        throw new Error('Unexpected path ' + path);
    }
  });
  const client = await import('../docs/cloud.js');
  assert.equal(client.enabled, true);
  assert.equal(client.account(), null);
  await client.sendSignInEmail(user.email, redirect);
  await assert.rejects(client.verifyCode(user.email, '000000'), /Expired code/);
  await client.verifyCode(user.email, '112233');
  assert.equal(client.account().id, user.id);
  assert.deepEqual(await Promise.all([
    client.rpc('sync_favorites', { p_ids: [2] }), client.rpc('sync_favorites', { p_ids: [3] })
  ]), [[2], [3]]);
  assert.equal(received.filter(path => path === '/auth/v1/token').length, 1);
  await client.signout();
  assert.equal(client.identity(), null);
  await Promise.all([client.guest(), client.guest()]);
  assert.equal(client.identity(), guest.id);
  assert.equal(client.account(), null);
  assert.equal(received.filter(path => path === '/auth/v1/signup').length, 1);
  assert.equal(client.emailLink(redirect + '?room=ABCD#room'), null);
  assert.deepEqual(client.emailLink(redirect + '?code=from-email&room=ABCD#room'), {
    address: redirect + '?room=ABCD#room', code: 'from-email'
  });
  assert.deepEqual(client.emailLink(redirect + '#error=access_denied&error_code=otp_expired'), {
    address: redirect, code: null
  });
  await assert.rejects(client.signInFromLink('from-email'), { code: 'missing_verifier' });
  await client.sendSignInEmail(user.email, redirect);
  await assert.rejects(client.signInFromLink('expired'), { code: 'flow_state_expired' });
  assert.equal(client.identity(), guest.id);
  await client.signInFromLink('from-email');
  assert.equal(client.account().id, user.id);
  await assert.rejects(client.signInFromLink('from-email'), { code: 'missing_verifier' });
});
