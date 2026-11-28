// Local browser QA. Two origins emulate two devices against the same in-memory database.
import { createHash, randomUUID } from 'node:crypto';
import { serve } from './serve.mjs';
import { testDatabase } from './postgres.mjs';

const db = await testDatabase();
const tokens = new Map();
const accounts = new Map();
const mail = new Map();
const exchangeCodes = new Map();
const operations = {
  aq_sync_favorites: ['p_ids'], aq_favorite: ['p_name', 'p_saved'],
  aq_create_room: ['p_questions'], aq_join_room: ['p_code', 'p_nickname'],
  aq_advance_room: ['p_code', 'p_phase', 'p_round'], aq_answer: ['p_code', 'p_round', 'p_choice'],
  aq_room_state: ['p_code'], aq_export_room: ['p_code'], aq_resume_room: []
};

async function login(email) {
  let user = email && accounts.get(email);
  if (!user) {
    user = { id: randomUUID(), email, is_anonymous: !email };
    await db.query('insert into auth.users values ($1)', [user.id]);
    if (email) accounts.set(email, user);
  }
  const access_token = randomUUID();
  tokens.set(access_token, user);
  return { user, access_token, refresh_token: access_token, expires_in: 3600 };
}

async function intercept(request, response, url) {
  if (url.pathname.endsWith('/config.js')) {
    response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end("export const config = { url: location.origin, key: 'local-test' };");
    return true;
  }
  if (url.pathname === '/__preview/email') {
    const email = url.searchParams.get('email');
    const draft = mail.get(email);
    if (!draft) {
      response.writeHead(404).end('Request a sign-in email in this browser first');
      return true;
    }
    const back = new URL(draft.redirect);
    if (back.origin !== `http://${request.headers.host}`) {
      response.writeHead(400).end('Use the test address from this origin');
      return true;
    }
    const code = randomUUID();
    mail.delete(email);
    exchangeCodes.set(code, { email, challenge: draft.challenge });
    back.searchParams.set('code', code);
    response.writeHead(303, { Location: back.href }).end();
    return true;
  }
  if (!/^\/(auth|rest)\/v1\//.test(url.pathname)) return false;
  const send = (body, status = 200) => {
    response.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));
    return true;
  };
  try {
    const chunks = [];
    for await (const part of request) chunks.push(part);
    const body = JSON.parse(Buffer.concat(chunks).toString() || '{}');
    const token = request.headers.authorization?.slice(7);
    if (url.pathname === '/auth/v1/otp') {
      if (!/^[^@]+@example\.test$/.test(body.email)) return send({ message: 'Use an example.test address' }, 400);
      const redirect = url.searchParams.get('redirect_to');
      if (!redirect || body.code_challenge_method !== 's256') return send({ message: 'Missing PKCE request parameters' }, 400);
      mail.set(body.email, { redirect, challenge: body.code_challenge });
      return send({});
    }
    if (url.pathname === '/auth/v1/verify') {
      if (body.token !== '112233' || !mail.delete(body.email)) return send({ message: 'Invalid code' }, 400);
      return send(await login(body.email));
    }
    if (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'pkce') {
      const draft = exchangeCodes.get(body.auth_code);
      const challenge = createHash('sha256').update(body.code_verifier || '').digest('base64url');
      if (!draft || draft.challenge !== challenge) return send({ message: 'Invalid email link' }, 400);
      exchangeCodes.delete(body.auth_code);
      return send(await login(draft.email));
    }
    if (url.pathname === '/auth/v1/signup') return send(await login());
    if (url.pathname === '/auth/v1/logout') {
      tokens.delete(token);
      response.writeHead(204).end();
      return true;
    }
    const functionName = url.pathname.split('/').at(-1);
    const args = operations[functionName];
    const user = tokens.get(token);
    if (!Object.hasOwn(operations, functionName) || !user) return send({ message: 'Unsupported operation' }, 401);
    const parameters = args.map(name => name === 'p_questions' ? JSON.stringify(body[name]) : body[name]);
    const bindings = parameters.map((_, index) => '$' + (index + 1));
    return await db.transaction(async tx => {
      await tx.exec('set local role authenticated');
      await tx.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: user.id, is_anonymous: user.is_anonymous })
      ]);
      const { rows } = await tx.query(`select public.${functionName}(${bindings.join(',')}) as result`, parameters);
      return send(rows[0].result);
    });
  } catch (error) {
    return send({ message: error.message }, 400);
  }
}

serve(4184, intercept);
serve(4185, intercept);
