-- Vietnam Social: PRD v1 first social vertical slice.
-- Local Post -> map discovery -> reaction/comment -> public profile -> follow.
-- Private social tables are not exposed directly through the Data API.

create table app_private.local_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  post_type text not null check (post_type in ('question','update','recommendation')),
  body text not null check (length(trim(body)) between 8 and 800),
  place_id uuid references public.places(id) on delete set null,
  area text not null check (length(trim(area)) between 2 and 120),
  longitude double precision not null check (longitude between -180 and 180),
  latitude double precision not null check (latitude between -90 and 90),
  location extensions.geography(Point,4326) generated always as
    (extensions.st_setsrid(extensions.st_makepoint(longitude, latitude),4326)::extensions.geography) stored,
  moderation_state text not null default 'published' check (moderation_state in ('published','quarantined','removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(author_id, request_id)
);
create index local_posts_map_idx on app_private.local_posts using gist(location);
create index local_posts_created_idx on app_private.local_posts(created_at desc) where moderation_state='published';
create index local_posts_author_idx on app_private.local_posts(author_id, created_at desc);

create table app_private.local_post_reactions (
  post_id uuid not null references app_private.local_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(post_id, user_id)
);
create index local_post_reactions_user_idx on app_private.local_post_reactions(user_id, created_at desc);

create table app_private.local_post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references app_private.local_posts(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (length(trim(body)) between 1 and 500),
  status text not null default 'visible' check (status in ('visible','removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index local_post_comments_post_idx on app_private.local_post_comments(post_id, created_at);
create index local_post_comments_author_idx on app_private.local_post_comments(author_id, created_at desc);

create table app_private.follows (
  follower_id uuid not null references auth.users(id) on delete cascade,
  following_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(follower_id, following_id),
  check (follower_id <> following_id)
);
create index follows_following_idx on app_private.follows(following_id, created_at desc);

create table app_private.local_post_reports (
  post_id uuid not null references app_private.local_posts(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason text not null default '' check (length(reason) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(post_id, reporter_id)
);
create index local_post_reports_time_idx on app_private.local_post_reports(reporter_id, created_at desc);

alter table app_private.local_posts enable row level security;
alter table app_private.local_post_reactions enable row level security;
alter table app_private.local_post_comments enable row level security;
alter table app_private.follows enable row level security;
alter table app_private.local_post_reports enable row level security;

revoke all on app_private.local_posts,
  app_private.local_post_reactions,
  app_private.local_post_comments,
  app_private.follows,
  app_private.local_post_reports
from public, anon, authenticated;

create or replace function app_private.project_local_post(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select jsonb_build_object(
    'id', lp.id,
    'post_type', lp.post_type,
    'body', lp.body,
    'place_id', lp.place_id,
    'place_name', coalesce(pl.name, ''),
    'area', lp.area,
    'longitude', lp.longitude,
    'latitude', lp.latitude,
    'created_at', lp.created_at,
    'updated_at', lp.updated_at,
    'author', jsonb_build_object(
      'id', pr.id,
      'display_name', pr.display_name,
      'role', pr.role,
      'organizer_label', coalesce(pr.organizer_label, ''),
      'bio', coalesce(pr.bio, '')
    ),
    'reaction_count', (select count(*) from app_private.local_post_reactions r where r.post_id=lp.id),
    'comment_count', (select count(*) from app_private.local_post_comments c where c.post_id=lp.id and c.status='visible'),
    'viewer_reacted', case when auth.uid() is null then false else exists(
      select 1 from app_private.local_post_reactions r where r.post_id=lp.id and r.user_id=auth.uid()
    ) end,
    'viewer_reported', case when auth.uid() is null then false else exists(
      select 1 from app_private.local_post_reports r where r.post_id=lp.id and r.reporter_id=auth.uid()
    ) end,
    'viewer_is_author', case when auth.uid() is null then false else lp.author_id=auth.uid() end
  )
  from app_private.local_posts lp
  join app_private.profiles pr on pr.id=lp.author_id
  left join public.places pl on pl.id=lp.place_id
  where lp.id=p_id and lp.moderation_state='published';
$$;

create or replace function public.discover_local_posts(p_bounds jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  w double precision;
  e double precision;
  n double precision;
  s double precision;
  result jsonb;
begin
  w := (p_bounds->>'west')::double precision;
  e := (p_bounds->>'east')::double precision;
  n := (p_bounds->>'north')::double precision;
  s := (p_bounds->>'south')::double precision;
  if w is null or e is null or n is null or s is null
    or not(w>=-180 and e<=180 and s>=-90 and n<=90 and e>w and n>s and e-w<=0.25 and n-s<=0.25) then
    raise exception using errcode='VS005',message='invalid bounds';
  end if;

  select coalesce(jsonb_agg(q.item order by q.created_at desc, q.id), '[]'::jsonb)
  into result
  from (
    select app_private.project_local_post(lp.id) as item, lp.created_at, lp.id
    from app_private.local_posts lp
    where lp.moderation_state='published'
      and extensions.st_intersects(
        lp.location,
        extensions.st_makeenvelope(w,s,e,n,4326)::extensions.geography
      )
    order by lp.created_at desc, lp.id
    limit 100
  ) q;
  return result;
end; $$;

create or replace function public.get_local_post(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select app_private.project_local_post(p_id);
$$;

create or replace function public.get_local_post_comments(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'post_id', c.post_id,
    'body', c.body,
    'created_at', c.created_at,
    'author', jsonb_build_object(
      'id', pr.id,
      'display_name', pr.display_name,
      'role', pr.role,
      'organizer_label', coalesce(pr.organizer_label, '')
    )
  ) order by c.created_at), '[]'::jsonb)
  from app_private.local_post_comments c
  join app_private.profiles pr on pr.id=c.author_id
  join app_private.local_posts lp on lp.id=c.post_id
  where c.post_id=p_id and c.status='visible' and lp.moderation_state='published';
$$;

create or replace function public.create_local_post(p_input jsonb)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  actor uuid := auth.uid();
  existing uuid;
  result uuid;
  v_place public.places;
  v_place_id uuid;
  v_area text;
  v_lng double precision;
  v_lat double precision;
  v_body text := trim(coalesce(p_input->>'body',''));
  v_type text := p_input->>'post_type';
begin
  if actor is null then
    raise exception using errcode='VS001',message='authentication required';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text, 3));

  select id into existing
  from app_private.local_posts
  where author_id=actor and request_id=(p_input->>'request_id')::uuid;
  if existing is not null then return existing; end if;

  if exists(select 1 from jsonb_object_keys(p_input) k where k not in ('request_id','post_type','body','place_id','area')) then
    raise exception using errcode='VS005',message='unknown fields';
  end if;
  if v_type not in ('question','update','recommendation') or length(v_body) not between 8 and 800 then
    raise exception using errcode='VS005',message='invalid local post';
  end if;

  if nullif(p_input->>'place_id','') is not null then
    v_place_id := (p_input->>'place_id')::uuid;
    select * into v_place from public.places where id=v_place_id and enabled and city_id='hcm';
    if v_place.id is null then
      raise exception using errcode='VS005',message='invalid public place';
    end if;
    v_area := v_place.area;
    v_lng := v_place.longitude;
    v_lat := v_place.latitude;
  else
    v_area := trim(coalesce(p_input->>'area',''));
    if length(v_area) not between 2 and 120 then
      raise exception using errcode='VS005',message='invalid area';
    end if;
    select avg(longitude), avg(latitude)
      into v_lng, v_lat
    from public.places
    where enabled and city_id='hcm' and area=v_area;
    if v_lng is null or v_lat is null then
      raise exception using errcode='VS005',message='unknown safe area';
    end if;
  end if;

  if (select count(*) from app_private.local_posts where author_id=actor and created_at>now()-interval '1 day') >= 5 then
    raise exception using errcode='VS006',message='local post rate limit';
  end if;

  insert into app_private.local_posts(author_id, request_id, post_type, body, place_id, area, longitude, latitude)
  values(actor, (p_input->>'request_id')::uuid, v_type, v_body, v_place_id, v_area, v_lng, v_lat)
  returning id into result;
  return result;
exception
  when check_violation or not_null_violation or invalid_text_representation then
    raise exception using errcode='VS005',message='invalid local post';
end; $$;

create or replace function public.toggle_local_post_reaction(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  actor uuid := auth.uid();
  reacted boolean;
  total integer;
begin
  if actor is null then raise exception using errcode='VS001',message='authentication required'; end if;
  if not exists(select 1 from app_private.local_posts where id=p_id and moderation_state='published') then
    raise exception using errcode='VS003',message='post unavailable';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text || p_id::text, 4));
  if exists(select 1 from app_private.local_post_reactions where post_id=p_id and user_id=actor) then
    delete from app_private.local_post_reactions where post_id=p_id and user_id=actor;
    reacted := false;
  else
    insert into app_private.local_post_reactions(post_id,user_id) values(p_id,actor);
    reacted := true;
  end if;
  select count(*) into total from app_private.local_post_reactions where post_id=p_id;
  return jsonb_build_object('reacted',reacted,'reaction_count',total);
end; $$;

create or replace function public.comment_local_post(p_id uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  actor uuid := auth.uid();
  result uuid;
  v_body text := trim(coalesce(p_body,''));
begin
  if actor is null then raise exception using errcode='VS001',message='authentication required'; end if;
  if not exists(select 1 from app_private.local_posts where id=p_id and moderation_state='published') then
    raise exception using errcode='VS003',message='post unavailable';
  end if;
  if length(v_body) not between 1 and 500 then
    raise exception using errcode='VS005',message='invalid comment';
  end if;
  if (select count(*) from app_private.local_post_comments where author_id=actor and created_at>now()-interval '1 hour') >= 20 then
    raise exception using errcode='VS006',message='comment rate limit';
  end if;
  insert into app_private.local_post_comments(post_id,author_id,body)
  values(p_id,actor,v_body) returning id into result;
  return result;
end; $$;

create or replace function public.report_local_post(p_id uuid, p_reason text default '')
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  actor uuid := auth.uid();
  v_reason text := trim(coalesce(p_reason,''));
begin
  if actor is null then raise exception using errcode='VS001',message='authentication required'; end if;
  if not exists(select 1 from app_private.local_posts where id=p_id and moderation_state='published') then
    raise exception using errcode='VS003',message='post unavailable';
  end if;
  if length(v_reason)>300 then raise exception using errcode='VS005',message='invalid report'; end if;
  if (select count(*) from app_private.local_post_reports where reporter_id=actor and created_at>now()-interval '1 hour') >= 20 then
    raise exception using errcode='VS006',message='report rate limit';
  end if;
  insert into app_private.local_post_reports(post_id,reporter_id,reason)
  values(p_id,actor,v_reason)
  on conflict(post_id,reporter_id) do update set reason=excluded.reason,updated_at=now();
end; $$;

create or replace function public.get_public_profile(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  result jsonb;
begin
  if not exists(select 1 from app_private.profiles where id=p_user_id) then return null; end if;
  select jsonb_build_object(
    'id', pr.id,
    'display_name', pr.display_name,
    'role', pr.role,
    'organizer_label', coalesce(pr.organizer_label,''),
    'bio', coalesce(pr.bio,''),
    'follower_count', (select count(*) from app_private.follows f where f.following_id=pr.id),
    'following_count', (select count(*) from app_private.follows f where f.follower_id=pr.id),
    'viewer_follows', case when auth.uid() is null then false else exists(
      select 1 from app_private.follows f where f.follower_id=auth.uid() and f.following_id=pr.id
    ) end,
    'is_self', case when auth.uid() is null then false else auth.uid()=pr.id end,
    'contributions', coalesce((
      select jsonb_agg(item order by created_at desc) from (
        select app_private.project_local_post(lp.id) as item, lp.created_at
        from app_private.local_posts lp
        where lp.author_id=pr.id and lp.moderation_state='published'
        order by lp.created_at desc limit 20
      ) q
    ), '[]'::jsonb)
  ) into result
  from app_private.profiles pr
  where pr.id=p_user_id;
  return result;
end; $$;

create or replace function public.set_follow(p_user_id uuid, p_follow boolean)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  actor uuid := auth.uid();
  followers integer;
begin
  if actor is null then raise exception using errcode='VS001',message='authentication required'; end if;
  if p_user_id=actor then raise exception using errcode='VS005',message='cannot follow self'; end if;
  if not exists(select 1 from app_private.profiles where id=p_user_id) then
    raise exception using errcode='VS003',message='profile unavailable';
  end if;
  if p_follow then
    if (select count(*) from app_private.follows where follower_id=actor and created_at>now()-interval '1 hour') >= 100 then
      raise exception using errcode='VS006',message='follow rate limit';
    end if;
    insert into app_private.follows(follower_id,following_id) values(actor,p_user_id)
    on conflict do nothing;
  else
    delete from app_private.follows where follower_id=actor and following_id=p_user_id;
  end if;
  select count(*) into followers from app_private.follows where following_id=p_user_id;
  return jsonb_build_object('following',p_follow,'follower_count',followers);
end; $$;

create or replace function public.moderate_local_post(p_id uuid, p_action text)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if not exists(select 1 from app_private.profiles where id=auth.uid() and role='moderator') then
    raise exception using errcode='VS002',message='moderator required';
  end if;
  if p_action not in ('quarantine','remove','restore') then
    raise exception using errcode='VS005',message='invalid moderation action';
  end if;
  update app_private.local_posts
  set moderation_state=case p_action when 'quarantine' then 'quarantined' when 'remove' then 'removed' else 'published' end,
      updated_at=now()
  where id=p_id;
  if not found then raise exception using errcode='VS003',message='post unavailable'; end if;
end; $$;

revoke all on function app_private.project_local_post(uuid) from public,anon,authenticated;
revoke all on function public.discover_local_posts(jsonb),
  public.get_local_post(uuid),
  public.get_local_post_comments(uuid),
  public.create_local_post(jsonb),
  public.toggle_local_post_reaction(uuid),
  public.comment_local_post(uuid,text),
  public.report_local_post(uuid,text),
  public.get_public_profile(uuid),
  public.set_follow(uuid,boolean),
  public.moderate_local_post(uuid,text)
from public,anon,authenticated;

grant execute on function public.discover_local_posts(jsonb),
  public.get_local_post(uuid),
  public.get_local_post_comments(uuid),
  public.get_public_profile(uuid)
to anon,authenticated;

grant execute on function public.create_local_post(jsonb),
  public.toggle_local_post_reaction(uuid),
  public.comment_local_post(uuid,text),
  public.report_local_post(uuid,text),
  public.set_follow(uuid,boolean),
  public.moderate_local_post(uuid,text)
to authenticated;
