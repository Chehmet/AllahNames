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

-- Nullable room language identifies games created by the previous client.
alter table asma_private.rooms add column if not exists language smallint check (language in (0, 1));
alter table asma_private.rooms add column if not exists opened_at timestamptz;
alter table asma_private.rooms add column if not exists deadline_at timestamptz;
alter table asma_private.answers add column if not exists elapsed_ms integer;
alter table asma_private.answers add column if not exists points integer not null default 0;
create index if not exists asma_answers_round on asma_private.answers (code, round, choice);

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
  hint jsonb;
  room_language smallint;
  translation jsonb;
  option_key text;
  seen integer[] := '{}';
  clean jsonb := '[]';
  code_candidate text;
begin
  if p_questions is null or jsonb_typeof(p_questions) <> 'array' or pg_column_size(p_questions) > 320000 then
    raise exception 'invalid_questions';
  end if;
  if jsonb_array_length(p_questions) not between 1 and 99 then raise exception 'invalid_questions'; end if;
  if p_questions->0 ? 'language' then
    if coalesce(p_questions->0->>'language', '') not in ('0', '1') then raise exception 'invalid_questions'; end if;
    room_language := (p_questions->0->>'language')::smallint;
  end if;
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
    hint := null;
    if room_language is not null then
      if jsonb_typeof(question->'cards') is distinct from 'object' then raise exception 'invalid_questions'; end if;
      foreach option_key in array option_ids::text[] loop
        translation := question->'cards'->option_key;
        if jsonb_typeof(translation) is distinct from 'array' then raise exception 'invalid_questions'; end if;
        if jsonb_array_length(translation) <> 5 or exists (
          select 1 from jsonb_array_elements(translation) as label(value)
          where jsonb_typeof(value) <> 'string' or char_length(value #>> '{}') not between 1 and 180
        ) then raise exception 'invalid_questions'; end if;
      end loop;
      wording := jsonb_build_array(question->'cards'->(question_id::text)->>3, question->'cards'->(question_id::text)->>4);
      if question ? 'hint' then
        hint := question->'hint';
        if jsonb_typeof(hint) is distinct from 'array' then raise exception 'invalid_questions'; end if;
        if jsonb_array_length(hint) <> 2 or exists (
          select 1 from jsonb_array_elements(hint) as clue(value)
          where jsonb_typeof(value) <> 'string' or char_length(value #>> '{}') not between 1 and 280
        ) then raise exception 'invalid_questions'; end if;
      end if;
    end if;
    if question->>'mode' = 'reverse' and (
       jsonb_typeof(wording) is distinct from 'array' or coalesce(char_length(wording->>0), 0) not between 1 and 180
       or coalesce(char_length(wording->>1), 0) not between 1 and 180) then raise exception 'invalid_questions'; end if;
    clean := clean || jsonb_build_array(jsonb_build_object(
      'id', question_id, 'mode', question->>'mode', 'options', option_ids,
      'wording', case when question->>'mode' = 'reverse' then jsonb_build_array(wording->>0, wording->>1) end,
      'hint', hint,
      'cards', case when room_language is not null then (
        select jsonb_object_agg(item, question->'cards'->item) from unnest(option_ids::text[]) item
      ) end
    ));
  end loop;
  perform pg_advisory_xact_lock(hashtext(caller::text));
  if (select count(*) from asma_private.rooms
      where host = caller and phase <> 'finished' and expires_at > now()) >= 6 then
    raise exception 'room_limit';
  end if;
  loop
    code_candidate := upper(left(replace(gen_random_uuid()::text, '-', ''), 8));
    insert into asma_private.rooms(code, host, questions, language) values (code_candidate, caller, clean, room_language)
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
  stamp timestamptz;
begin
  select * into game from asma_private.rooms where code = upper(p_code) and expires_at > now() for update;
  if not found or caller <> game.host then raise exception 'room_unavailable'; end if;
  if game.phase is distinct from p_phase or game.round is distinct from p_round then return false; end if;
  stamp := clock_timestamp();
  case game.phase
    when 'lobby' then
      if not exists (select 1 from asma_private.players where code = game.code) then raise exception 'no_players'; end if;
      update asma_private.rooms set phase = 'question', opened_at = stamp,
        deadline_at = case when game.language is not null then stamp + interval '40 seconds' end
        where code = game.code;
    when 'question' then
      update asma_private.rooms set phase = 'reveal',
        deadline_at = case when game.language is not null then stamp + interval '10 seconds' end
        where code = game.code;
    when 'reveal' then
      if game.round + 1 >= jsonb_array_length(game.questions) then
        update asma_private.rooms set phase = 'finished', deadline_at = null, expires_at = stamp + interval '7 days' where code = game.code;
      else
        update asma_private.rooms set phase = 'question', round = round + 1, opened_at = stamp,
          deadline_at = case when game.language is not null then stamp + interval '40 seconds' end
          where code = game.code;
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
  received_at timestamptz := clock_timestamp();
  elapsed integer;
  is_correct boolean;
begin
  select * into game from asma_private.rooms where code = upper(p_code) and expires_at > now() for update;
  if not found or not exists (select 1 from asma_private.players where code = game.code and user_id = caller) then
    raise exception 'room_unavailable';
  end if;
  if game.phase <> 'question' or p_round is distinct from game.round then raise exception 'round_closed'; end if;
  if game.deadline_at is not null and received_at >= game.deadline_at then raise exception 'round_closed'; end if;
  question := game.questions->game.round;
  if p_choice is null or not ((question->'options') @> jsonb_build_array(p_choice)) then
    raise exception 'invalid_selection';
  end if;
  is_correct := p_choice = (question->>'id')::integer;
  if game.language is not null then
    elapsed := greatest(0, least(40000, round(extract(epoch from received_at - game.opened_at) * 1000)::integer));
  end if;
  insert into asma_private.answers as submitted(code, user_id, round, choice, correct, elapsed_ms, points)
  values (game.code, caller, game.round, p_choice, is_correct, elapsed,
    case when not is_correct then 0 when elapsed is null then 1 else 1000 + (250 * (40000 - elapsed) / 40000) end)
  on conflict (code, user_id, round) do update
    set choice = excluded.choice, correct = excluded.correct, elapsed_ms = excluded.elapsed_ms, points = excluded.points
    where game.language is not null and submitted.choice <> excluded.choice;
  if game.language is not null
     and (select count(*) from asma_private.players where code = game.code) =
         (select count(*) from asma_private.answers where code = game.code and round = game.round) then
    update asma_private.rooms set phase = 'reveal', deadline_at = clock_timestamp() + interval '10 seconds' where code = game.code;
  end if;
  return (select choice from asma_private.answers where code = game.code and user_id = caller and round = game.round);
end;
$$;

create or replace function asma_private.distribution(p_code text, p_round integer, p_question jsonb)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', (p_question->>'id')::integer,
    'mode', p_question->>'mode',
    'round', p_round,
    'cards', p_question->'cards',
    'options', (select jsonb_agg(jsonb_build_object('id', option_id::integer, 'count', (
      select count(*) from asma_private.answers where code = p_code and round = p_round and choice = option_id::integer
    )) order by position) from jsonb_array_elements_text(p_question->'options') with ordinality as o(option_id, position))
  );
$$;

create or replace function public.aq_resume_room()
returns text language sql stable security definer set search_path = '' as $$
  with caller as (select asma_private.user_id() as id)
  select r.code from asma_private.rooms r cross join caller
  where r.expires_at > now() and (r.host = caller.id or exists (
    select 1 from asma_private.players p where p.code = r.code and p.user_id = caller.id
  ))
  order by (r.phase = 'finished'), r.created_at desc limit 1;
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
  personal jsonb;
  question_view jsonb;
  stamp timestamptz;
begin
  select * into game from asma_private.rooms where code = upper(p_code) and expires_at > now() for update;
  if not found or (game.host <> caller and not exists (
    select 1 from asma_private.players where code = game.code and user_id = caller
  )) then raise exception 'room_unavailable'; end if;
  stamp := clock_timestamp();
  if game.deadline_at <= stamp then
    if game.phase = 'question' then
      update asma_private.rooms set phase = 'reveal', deadline_at = stamp + interval '10 seconds'
        where code = game.code returning * into game;
    elsif game.phase = 'reveal' then
      if game.round + 1 >= jsonb_array_length(game.questions) then
        update asma_private.rooms set phase = 'finished', deadline_at = null, expires_at = stamp + interval '7 days'
          where code = game.code returning * into game;
      else
        update asma_private.rooms set phase = 'question', round = round + 1, opened_at = stamp,
          deadline_at = stamp + interval '40 seconds' where code = game.code returning * into game;
      end if;
    end if;
  end if;
  question := game.questions->game.round;
  result := jsonb_build_object(
    'code', game.code, 'host', caller = game.host, 'phase', game.phase,
    'round', game.round, 'total', jsonb_array_length(game.questions),
    'language', game.language, 'deadline', game.deadline_at,
    'remainingMs', case when game.deadline_at is not null then
      greatest(0, ceil(extract(epoch from (game.deadline_at - stamp)) * 1000)::integer) end,
    'players', (select coalesce(jsonb_agg(nickname order by joined_at, nickname), '[]')
                from asma_private.players where code = game.code),
    'answered', (select count(*) from asma_private.answers where code = game.code and round = game.round),
    'pick', (select choice from asma_private.answers where code = game.code and round = game.round and user_id = caller)
  );
  if game.phase = 'question' then
    question_view := question - 'id' - 'cards';
    if game.language is not null then
      question_view := question_view || jsonb_build_object('labels', (
        select jsonb_object_agg(option_key, case when question->>'mode' = 'reverse'
          then jsonb_build_array(card->0, card->1, card->2) else jsonb_build_array(card->3, card->4) end)
        from jsonb_each(question->'cards') as option(option_key, card)
      ), 'promptName', case when question->>'mode' <> 'reverse' then
        jsonb_build_array(question->'cards'->(question->>'id')->0, question->'cards'->(question->>'id')->1,
                          question->'cards'->(question->>'id')->2) end);
    end if;
    result := result || jsonb_build_object('question', question_view,
      'prompt', case when question->>'mode' = 'reverse' then null else question->'id' end);
  elsif game.phase = 'reveal' then
    result := result || jsonb_build_object('distribution', asma_private.distribution(game.code, game.round, question),
      'roundPoints', (select points from asma_private.answers where code = game.code and round = game.round and user_id = caller));
  elsif game.phase = 'finished' then
    select coalesce(jsonb_agg(to_jsonb(ranked) order by place, nickname), '[]') into leaderboard
    from (
      select nickname, score, correct, submitted,
        case when game.language is null then rank() over (order by score desc)
             else dense_rank() over (order by score desc) end as place
      from (
        select p.nickname,
          case when game.language is null then count(*) filter (where a.correct) else coalesce(sum(a.points), 0) end as score,
          count(*) filter (where a.correct) as correct, count(a.choice) as submitted
        from asma_private.players p left join asma_private.answers a on a.code = p.code and a.user_id = p.user_id
        where p.code = game.code group by p.user_id, p.nickname
      ) scores
    ) ranked;
    if game.language is not null then
      select coalesce(jsonb_agg(item), '[]') into leaderboard from jsonb_array_elements(leaderboard) item
      where (item->>'place')::integer <= 3 and (item->>'score')::integer > 0;
    end if;
    if caller <> game.host then
      select jsonb_build_object(
        'correct', count(*) filter (where correct), 'submitted', count(choice),
        'points', case when game.language is null then count(*) filter (where correct) else coalesce(sum(points), 0) end,
        'review', coalesce(jsonb_agg((q->>'id')::integer order by position) filter (where correct is not true), '[]')
      ) into personal
      from jsonb_array_elements(game.questions) with ordinality as qs(q, position)
      left join asma_private.answers a on a.code = game.code and a.user_id = caller and a.round = position - 1;
    end if;
    select jsonb_agg(asma_private.distribution(game.code, (position - 1)::integer, q) order by position) into totals
    from jsonb_array_elements(game.questions) with ordinality as qs(q, position);
    result := result || jsonb_build_object('leaderboard', leaderboard, 'results', totals, 'personal', personal);
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
      'choice', a.choice, 'correct', a.correct,
      'points', case when game.language is not null then a.points end, 'elapsedMs', a.elapsed_ms,
      'name', q->'cards'->(q->>'id')->>(game.language + 1),
      'selectedName', q->'cards'->(a.choice::text)->>(game.language + 1)
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
  public.aq_answer(text, integer, integer), public.aq_room_state(text), public.aq_export_room(text), public.aq_resume_room() from public, anon;

grant execute on function
  public.aq_sync_favorites(integer[]), public.aq_favorite(integer, boolean),
  public.aq_create_room(jsonb), public.aq_join_room(text, text), public.aq_advance_room(text, text, integer),
  public.aq_answer(text, integer, integer), public.aq_room_state(text), public.aq_export_room(text), public.aq_resume_room() to authenticated;

notify pgrst, 'reload schema';

commit;
