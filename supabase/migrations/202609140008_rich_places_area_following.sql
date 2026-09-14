-- Vietnam Social: Phase D — rich social Places and persistent Place/Area following.
-- Places remain public physical anchors; following never exposes a person's live location.

create table app_private.place_follows (
  user_id uuid not null references auth.users(id) on delete cascade,
  place_id uuid not null references public.places(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(user_id, place_id)
);
create index place_follows_place_idx on app_private.place_follows(place_id, created_at desc);

create table app_private.area_follows (
  user_id uuid not null references auth.users(id) on delete cascade,
  city_id text not null references public.cities(id) on delete cascade,
  area text not null check (length(trim(area)) between 2 and 120),
  created_at timestamptz not null default now(),
  primary key(user_id, city_id, area)
);
create index area_follows_area_idx on app_private.area_follows(city_id, area, created_at desc);

alter table app_private.place_follows enable row level security;
alter table app_private.area_follows enable row level security;
revoke all on app_private.place_follows, app_private.area_follows from public, anon, authenticated;

-- One catalog-derived identity is shared by reads and writes, including casing variants.
create or replace function app_private.canonical_area(p_city_id text, p_area text)
returns text language sql stable security definer set search_path='' as $$
  select trim(p.area) from public.places p join public.cities c on c.id=p.city_id
  where p.city_id=p_city_id and p.enabled and c.active
    and lower(trim(p.area))=lower(trim(p_area))
  order by trim(p.area) collate "C" limit 1;
$$;
revoke all on function app_private.canonical_area(text,text) from public,anon,authenticated;

create or replace function app_private.project_place_social(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select jsonb_build_object(
    'id', p.id,
    'city_id', p.city_id,
    'name', p.name,
    'area', app_private.canonical_area(p.city_id,p.area),
    'longitude', p.longitude,
    'latitude', p.latitude,
    'h3_parent', p.h3_parent,
    'follower_count', (
      select count(*) from app_private.place_follows f where f.place_id=p.id
    ),
    'area_follower_count', (
      select count(*) from app_private.area_follows f where f.city_id=p.city_id and f.area=app_private.canonical_area(p.city_id,p.area)
    ),
    'viewer_follows', case when auth.uid() is null then false else exists(
      select 1 from app_private.place_follows f where f.user_id=auth.uid() and f.place_id=p.id
    ) end,
    'viewer_follows_area', case when auth.uid() is null then false else exists(
      select 1 from app_private.area_follows f where f.user_id=auth.uid() and f.city_id=p.city_id and f.area=app_private.canonical_area(p.city_id,p.area)
    ) end
  )
  from public.places p
  join public.cities c on c.id=p.city_id
  where p.id=p_id and p.enabled and c.active;
$$;

create or replace function public.get_place_social_page(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_place jsonb;
  v_posts jsonb;
  v_activities jsonb;
  v_communities jsonb;
begin
  v_place := app_private.project_place_social(p_id);
  if v_place is null then return null; end if;

  select coalesce(jsonb_agg(q.item order by q.created_at desc, q.id), '[]'::jsonb)
  into v_posts
  from (
    select app_private.project_local_post(lp.id) as item, lp.created_at, lp.id
    from app_private.local_posts lp
    where lp.place_id=p_id and lp.moderation_state='published'
      and app_private.project_local_post(lp.id) is not null
    order by lp.created_at desc, lp.id
    limit 30
  ) q;

  select coalesce(jsonb_agg(q.item order by q.starts_at, q.id), '[]'::jsonb)
  into v_activities
  from (
    select projected.item, s.starts_at, s.id
    from app_private.signals s
    cross join lateral (select app_private.project_signal(s.id) as item) projected
    where s.place_id=p_id and projected.item is not null
    order by s.starts_at, s.id
    limit 20
  ) q;

  select coalesce(jsonb_agg(q.item order by q.created_at desc, q.id), '[]'::jsonb)
  into v_communities
  from (
    select app_private.project_community(c.id) as item, c.created_at, c.id
    from app_private.communities c
    where c.place_id=p_id and c.moderation_state='published'
      and app_private.project_community(c.id) is not null
    order by c.created_at desc, c.id
    limit 20
  ) q;

  return jsonb_build_object(
    'place', v_place,
    'posts', v_posts,
    'activities', v_activities,
    'communities', v_communities
  );
end; $$;

create or replace function public.set_place_follow(p_place_id uuid, p_follow boolean)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  actor uuid := auth.uid();
  total integer;
begin
  if actor is null then raise exception using errcode='VS001',message='authentication required'; end if;
  if p_follow is null then raise exception using errcode='VS003',message='follow must be boolean'; end if;
  if not exists(
    select 1 from public.places p join public.cities c on c.id=p.city_id
    where p.id=p_place_id and p.enabled and c.active
  ) then
    raise exception using errcode='VS003',message='place unavailable';
  end if;

  -- Separate advisory-lock namespaces serialize retries for each explicit graph edge.
  perform pg_advisory_xact_lock(hashtextextended(actor::text || p_place_id::text, 11));
  if p_follow then
    insert into app_private.place_follows(user_id,place_id)
    values(actor,p_place_id)
    on conflict(user_id,place_id) do nothing;
  else
    delete from app_private.place_follows where user_id=actor and place_id=p_place_id;
  end if;

  select count(*) into total from app_private.place_follows where place_id=p_place_id;
  return jsonb_build_object('following',p_follow,'follower_count',total);
end; $$;

create or replace function public.set_area_follow(p_city_id text, p_area text, p_follow boolean)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  actor uuid := auth.uid();
  canonical_area text;
  total integer;
begin
  if actor is null then raise exception using errcode='VS001',message='authentication required'; end if;
  if p_follow is null then raise exception using errcode='VS003',message='follow must be boolean'; end if;

  canonical_area := app_private.canonical_area(p_city_id,p_area);

  if canonical_area is null then
    raise exception using errcode='VS003',message='area unavailable';
  end if;

  -- Separate advisory-lock namespaces serialize retries for each explicit graph edge.
  perform pg_advisory_xact_lock(hashtextextended(actor::text || p_city_id || canonical_area, 12));
  if p_follow then
    insert into app_private.area_follows(user_id,city_id,area)
    values(actor,p_city_id,canonical_area)
    on conflict(user_id,city_id,area) do nothing;
  else
    delete from app_private.area_follows
    where user_id=actor and city_id=p_city_id and area=canonical_area;
  end if;

  select count(*) into total
  from app_private.area_follows
  where city_id=p_city_id and area=canonical_area;

  return jsonb_build_object(
    'following',p_follow,
    'follower_count',total,
    'city_id',p_city_id,
    'area',canonical_area
  );
end; $$;

create or replace function public.get_my_local_follows()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  actor uuid := auth.uid();
  v_places jsonb;
  v_areas jsonb;
begin
  if actor is null then raise exception using errcode='VS001',message='authentication required'; end if;

  select coalesce(jsonb_agg(q.item order by q.name, q.id), '[]'::jsonb)
  into v_places
  from (
    select jsonb_build_object(
      'id', p.id,
      'city_id', p.city_id,
      'name', p.name,
      'area', app_private.canonical_area(p.city_id,p.area),
      'longitude', p.longitude,
      'latitude', p.latitude,
      'follower_count', (select count(*) from app_private.place_follows pf2 where pf2.place_id=p.id)
    ) as item,
    p.name,
    p.id
    from app_private.place_follows pf
    join public.places p on p.id=pf.place_id and p.enabled
    join public.cities c on c.id=p.city_id and c.active
    where pf.user_id=actor
  ) q;

  select coalesce(jsonb_agg(q.item order by q.area), '[]'::jsonb)
  into v_areas
  from (
    select jsonb_build_object(
      'city_id', af.city_id,
      'city_name', c.name,
      'area', af.area,
      'follower_count', (
        select count(*) from app_private.area_follows af2
        where af2.city_id=af.city_id and af2.area=af.area
      )
    ) as item,
    af.area
    from app_private.area_follows af
    join public.cities c on c.id=af.city_id and c.active
    where af.user_id=actor and app_private.canonical_area(af.city_id,af.area) is not null
  ) q;

  return jsonb_build_object('places',v_places,'areas',v_areas);
end; $$;

revoke all on function app_private.project_place_social(uuid) from public, anon, authenticated;
revoke all on function public.get_place_social_page(uuid),
  public.set_place_follow(uuid,boolean),
  public.set_area_follow(text,text,boolean),
  public.get_my_local_follows()
from public, anon, authenticated;

grant execute on function public.get_place_social_page(uuid) to anon, authenticated;
grant execute on function public.set_place_follow(uuid,boolean),
  public.set_area_follow(text,text,boolean),
  public.get_my_local_follows()
to authenticated;

-- Bounded area context, not an infinite feed. Only catalog-recognized public areas exist.
create or replace function public.get_area_social_page(p_city_id text, p_area text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  v_area text := app_private.canonical_area(p_city_id,p_area);
  v_places jsonb;
  v_posts jsonb;
  v_activities jsonb;
  v_communities jsonb;
begin
  if v_area is null then return null; end if;
  select coalesce(jsonb_agg(q.item order by q.name,q.id),'[]'::jsonb) into v_places from (
    select app_private.project_place_social(p.id) item,p.name,p.id
    from public.places p where p.city_id=p_city_id and p.enabled
      and lower(trim(p.area))=lower(v_area) order by p.name,p.id limit 30
  ) q;
  select coalesce(jsonb_agg(q.item order by q.created_at desc,q.id),'[]'::jsonb) into v_posts from (
    select app_private.project_local_post(lp.id) item,lp.created_at,lp.id
    from app_private.local_posts lp
    -- Existing Local Posts and Communities are HCMC-only (migrations 006/007).
    where p_city_id='hcm' and lower(trim(lp.area))=lower(v_area)
      and app_private.project_local_post(lp.id) is not null
    order by lp.created_at desc,lp.id limit 30
  ) q;
  select coalesce(jsonb_agg(q.item order by q.starts_at,q.id),'[]'::jsonb) into v_activities from (
    select app_private.project_signal(s.id) item,s.starts_at,s.id
    from app_private.signals s join public.places p on p.id=s.place_id
    where p.city_id=p_city_id and lower(trim(p.area))=lower(v_area)
      and app_private.project_signal(s.id) is not null
    order by s.starts_at,s.id limit 20
  ) q;
  select coalesce(jsonb_agg(q.item order by q.created_at desc,q.id),'[]'::jsonb) into v_communities from (
    select app_private.project_community(c.id) item,c.created_at,c.id
    from app_private.communities c
    where p_city_id='hcm' and lower(trim(c.area))=lower(v_area)
      and app_private.project_community(c.id) is not null
    order by c.created_at desc,c.id limit 20
  ) q;
  return jsonb_build_object('city_id',p_city_id,'area',v_area,
    'city_name',(select name from public.cities where id=p_city_id),
    'places',v_places,'posts',v_posts,'activities',v_activities,'communities',v_communities);
end; $$;
revoke all on function public.get_area_social_page(text,text) from public,anon,authenticated;
grant execute on function public.get_area_social_page(text,text) to anon,authenticated;
