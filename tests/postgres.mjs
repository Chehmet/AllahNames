import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

export const schema = () => readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8');

export async function testDatabase() {
  const db = await PGlite.create();
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.jwt() returns jsonb language sql stable
      as $$ select nullif(current_setting('request.jwt.claims', true), '')::jsonb $$;
    create function auth.uid() returns uuid language sql stable
      as $$ select (auth.jwt()->>'sub')::uuid $$;
  `);
  await db.exec(await schema());
  return db;
}
