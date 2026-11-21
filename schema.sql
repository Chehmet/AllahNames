begin;

create schema if not exists asma_private;
revoke all on schema asma_private from public, anon, authenticated;

create table if not exists asma_private.favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  name_id smallint not null check (name_id between 1 and 99),
  primary key (user_id, name_id)
);

create table if not exists asma_private.rooms (
  code text primary key check (code ~ '^[A-F0-9]{8}$'),
  host uuid not null references auth.users(id) on delete cascade,
  questions jsonb not null,
  phase text not null default 'lobby' check (phase in ('lobby', 'question', 'reveal', 'finished')),
  round integer not null default 0,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '6 hours')
);

create table if not exists asma_private.players (
  code text not null references asma_private.rooms(code) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  nickname text not null check (char_length(nickname) between 1 and 24),
  joined_at timestamptz not null default now(),
  primary key (code, user_id)
);

create unique index if not exists asma_unique_nickname on asma_private.players (code, lower(nickname));

create table if not exists asma_private.answers (
  code text not null,
  user_id uuid not null,
  round integer not null check (round between 0 and 98),
  choice smallint not null check (choice between 1 and 99),
  correct boolean not null,
  primary key (code, user_id, round),
  foreign key (code, user_id) references asma_private.players(code, user_id) on delete cascade
);

alter table asma_private.favorites enable row level security;
alter table asma_private.rooms enable row level security;
alter table asma_private.players enable row level security;
alter table asma_private.answers enable row level security;

create or replace function asma_private.user_id(p_permanent boolean default false)
returns uuid language plpgsql stable set search_path = '' as $$
declare caller uuid := auth.uid();
begin
  if caller is null or (p_permanent and coalesce(auth.jwt()->>'is_anonymous', 'false') = 'true') then
    raise exception 'sign_in_required';
  end if;
  return caller;
end;
$$;

create or replace function public.aq_sync_favorites(p_ids integer[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare caller uuid := asma_private.user_id(true);
begin
  if coalesce(cardinality(p_ids), 0) > 99 then raise exception 'invalid_selection'; end if;
  insert into asma_private.favorites(user_id, name_id)
  select caller, item from unnest(p_ids) as item where item between 1 and 99
  on conflict do nothing;
  return (select coalesce(jsonb_agg(name_id order by name_id), '[]')
          from asma_private.favorites where user_id = caller);
end;
$$;

create or replace function public.aq_favorite(p_name integer, p_saved boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
declare caller uuid := asma_private.user_id(true);
begin
  if p_name is null or p_name not between 1 and 99 or p_saved is null then raise exception 'invalid_selection'; end if;
  if p_saved then
    insert into asma_private.favorites(user_id, name_id)
    values (caller, p_name) on conflict do nothing;
  else
    delete from asma_private.favorites where user_id = caller and name_id = p_name;
  end if;
  return p_saved;
end;
$$;

create or replace function public.aq_create_room(p_questions jsonb)
returns text language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := asma_private.user_id(true);
  question jsonb;
  question_id integer;
  option_ids integer[];
  wording jsonb;
  seen integer[] := '{}';
  clean jsonb := '[]';
  code_candidate text;
begin
  if p_questions is null or jsonb_typeof(p_questions) <> 'array' or pg_column_size(p_questions) > 48000 then
    raise exception 'invalid_questions';
  end if;
  if jsonb_array_length(p_questions) not between 1 and 99 then raise exception 'invalid_questions'; end if;
  for question in select value from jsonb_array_elements(p_questions)
  loop
    question_id := (question->>'id')::integer;
    if question_id is null or question_id not between 1 and 99 or question_id = any(seen)
       or coalesce(question->>'mode', '') not in ('name', 'arabic', 'reverse')
       or jsonb_typeof(question->'options') is distinct from 'array' then
      raise exception 'invalid_questions';
    end if;
    if jsonb_array_length(question->'options') <> 4 then raise exception 'invalid_questions'; end if;
    select array_agg(value::integer order by position) into option_ids
      from jsonb_array_elements_text(question->'options') with ordinality as o(value, position);
    if exists (select 1 from unnest(option_ids) as item where item is null or item not between 1 and 99)
       or (select count(distinct item) from unnest(option_ids) as item) <> 4
       or not (question_id = any(option_ids)) then raise exception 'invalid_questions'; end if;
    seen := array_append(seen, question_id);
    wording := question->'wording';
    if question->>'mode' = 'reverse' and (
       jsonb_typeof(wording) is distinct from 'array' or coalesce(char_length(wording->>0), 0) not between 1 and 180
       or coalesce(char_length(wording->>1), 0) not between 1 and 180) then raise exception 'invalid_questions'; end if;
    clean := clean || jsonb_build_array(jsonb_build_object(
      'id', question_id, 'mode', question->>'mode', 'options', option_ids,
      'wording', case when question->>'mode' = 'reverse' then jsonb_build_array(wording->>0, wording->>1) end
    ));
  end loop;
  perform pg_advisory_xact_lock(hashtext(caller::text));
  if (select count(*) from asma_private.rooms
      where host = caller and phase <> 'finished' and expires_at > now()) >= 6 then
    raise exception 'room_limit';
  end if;
  loop
    code_candidate := upper(left(replace(gen_random_uuid()::text, '-', ''), 8));
    insert into asma_private.rooms(code, host, questions) values (code_candidate, caller, clean)
    on conflict do nothing;
    if found then return code_candidate; end if;
  end loop;
end;
$$;

create or replace function public.aq_join_room(p_code text, p_nickname text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := asma_private.user_id();
  game asma_private.rooms%rowtype;
  display text := btrim(p_nickname);
begin
  select * into game from asma_private.rooms where code = upper(p_code) and expires_at > now() for update;
  if not found then raise exception 'room_unavailable'; end if;
  if game.host = caller then return true; end if;
  if exists (select 1 from asma_private.players where code = game.code and user_id = caller) then return true; end if;
  if game.phase <> 'lobby' then raise exception 'game_started'; end if;
  if display is null or char_length(display) not between 1 and 24 or display ~ '[[:cntrl:]]' then
    raise exception 'invalid_nickname';
  end if;
  if (select count(*) from asma_private.players where code = game.code) >= 60 then raise exception 'room_full'; end if;
  insert into asma_private.players(code, user_id, nickname) values (game.code, caller, display);
  return true;
exception when unique_violation then raise exception 'nickname_taken';
end;
$$;

create or replace function public.aq_advance_room(p_code text, p_phase text, p_round integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := asma_private.user_id(true);
  game asma_private.rooms%rowtype;
begin
  select * into game from asma_private.rooms where code = upper(p_code) and expires_at > now() for update;
  if not found or caller <> game.host then raise exception 'room_unavailable'; end if;
  if game.phase is distinct from p_phase or game.round is distinct from p_round then return false; end if;
  case game.phase
    when 'lobby' then
      if not exists (select 1 from asma_private.players where code = game.code) then raise exception 'no_players'; end if;
      update asma_private.rooms set phase = 'question' where code = game.code;
    when 'question' then
      update asma_private.rooms set phase = 'reveal' where code = game.code;
    when 'reveal' then
      if game.round + 1 >= jsonb_array_length(game.questions) then
        update asma_private.rooms set phase = 'finished', expires_at = now() + interval '7 days' where code = game.code;
      else
        update asma_private.rooms set phase = 'question', round = round + 1 where code = game.code;
      end if;
    else return false;
  end case;
  return true;
end;
$$;

create or replace function public.aq_answer(p_code text, p_round integer, p_choice integer)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := asma_private.user_id();
  game asma_private.rooms%rowtype;
  question jsonb;
begin
  select * into game from asma_private.rooms where code = upper(p_code) and expires_at > now() for share;
  if not found or not exists (select 1 from asma_private.players where code = game.code and user_id = caller) then
    raise exception 'room_unavailable';
  end if;
  if game.phase <> 'question' or p_round is distinct from game.round then raise exception 'round_closed'; end if;
  question := game.questions->game.round;
  if p_choice is null or not ((question->'options') @> jsonb_build_array(p_choice)) then
    raise exception 'invalid_selection';
  end if;
  insert into asma_private.answers(code, user_id, round, choice, correct)
  values (game.code, caller, game.round, p_choice, p_choice = (question->>'id')::integer)
  on conflict do nothing;
  return (select choice from asma_private.answers where code = game.code and user_id = caller and round = game.round);
end;
$$;

create or replace function asma_private.distribution(p_code text, p_round integer, p_question jsonb)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', (p_question->>'id')::integer,
    'mode', p_question->>'mode',
    'round', p_round,
    'options', (select jsonb_agg(jsonb_build_object('id', option_id::integer, 'count', (
      select count(*) from asma_private.answers where code = p_code and round = p_round and choice = option_id::integer
    )) order by position) from jsonb_array_elements_text(p_question->'options') with ordinality as o(option_id, position))
  );
$$;

create or replace function public.aq_room_state(p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := asma_private.user_id();
  game asma_private.rooms%rowtype;
  question jsonb;
  result jsonb;
  leaderboard jsonb;
  totals jsonb;
begin
  select * into game from asma_private.rooms where code = upper(p_code) and expires_at > now() for share;
  if not found or (game.host <> caller and not exists (
    select 1 from asma_private.players where code = game.code and user_id = caller
  )) then raise exception 'room_unavailable'; end if;
  question := game.questions->game.round;
  result := jsonb_build_object(
    'code', game.code, 'host', caller = game.host, 'phase', game.phase,
    'round', game.round, 'total', jsonb_array_length(game.questions),
    'players', (select coalesce(jsonb_agg(nickname order by joined_at, nickname), '[]')
                from asma_private.players where code = game.code),
    'answered', (select count(*) from asma_private.answers where code = game.code and round = game.round),
    'pick', (select choice from asma_private.answers where code = game.code and round = game.round and user_id = caller)
  );
  if game.phase = 'question' then
    result := result || jsonb_build_object('question', question - 'id',
      'prompt', case when question->>'mode' = 'reverse' then null else question->'id' end);
  elsif game.phase = 'reveal' then
    result := result || jsonb_build_object('distribution', asma_private.distribution(game.code, game.round, question));
  elsif game.phase = 'finished' then
    select coalesce(jsonb_agg(to_jsonb(ranked) order by place, nickname), '[]') into leaderboard
    from (
      select nickname, score, submitted, rank() over (order by score desc) as place
      from (
        select p.nickname, count(*) filter (where a.correct) as score, count(a.choice) as submitted
        from asma_private.players p left join asma_private.answers a on a.code = p.code and a.user_id = p.user_id
        where p.code = game.code group by p.user_id, p.nickname
      ) scores
    ) ranked;
    select jsonb_agg(asma_private.distribution(game.code, (position - 1)::integer, q) order by position) into totals
    from jsonb_array_elements(game.questions) with ordinality as qs(q, position);
    result := result || jsonb_build_object('leaderboard', leaderboard, 'results', totals);
  end if;
  return result;
end;
$$;

create or replace function public.aq_export_room(p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := asma_private.user_id(true);
  game asma_private.rooms%rowtype;
begin
  select * into game from asma_private.rooms where code = upper(p_code) and expires_at > now() for share;
  if not found or game.host <> caller or game.phase <> 'finished' then raise exception 'room_unavailable'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'nickname', p.nickname, 'round', position, 'id', (q->>'id')::integer,
      'choice', a.choice, 'correct', a.correct
    ) order by position, p.nickname), '[]')
    from asma_private.players p
    cross join jsonb_array_elements(game.questions) with ordinality as qs(q, position)
    left join asma_private.answers a on a.code = p.code and a.user_id = p.user_id and a.round = position - 1
    where p.code = game.code);
end;
$$;

revoke execute on function
  public.aq_sync_favorites(integer[]), public.aq_favorite(integer, boolean),
  public.aq_create_room(jsonb), public.aq_join_room(text, text), public.aq_advance_room(text, text, integer),
  public.aq_answer(text, integer, integer), public.aq_room_state(text), public.aq_export_room(text) from public, anon;

grant execute on function
  public.aq_sync_favorites(integer[]), public.aq_favorite(integer, boolean),
  public.aq_create_room(jsonb), public.aq_join_room(text, text), public.aq_advance_room(text, text, integer),
  public.aq_answer(text, integer, integer), public.aq_room_state(text), public.aq_export_room(text) to authenticated;

commit;
