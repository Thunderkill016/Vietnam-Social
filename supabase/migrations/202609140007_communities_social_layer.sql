-- Vietnam Social: map-native Communities social layer.
-- Community -> map discovery -> join/leave -> Local Post -> Activity linkage.

create table app_private.communities (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 3 and 80),
  description text not null default '' check (length(description) <= 600),
  category text not null check (category in ('neighborhood','sport','hobby','learning','professional','culture','volunteer','other')),
  place_id uuid references public.places(id) on delete set null,
  area text not null check (length(trim(area)) between 2 and 120),
  longitude double precision not null check (longitude between -180 and 180),
  latitude double precision not null check (latitude between -90 and 90),
  location extensions.geography(Point,4326) generated always as
    (extensions.st_setsrid(extensions.st_makepoint(longitude, latitude),4326)::extensions.geography) stored,
  moderation_state text not null default 'published' check (moderation_state in ('published','quarantined','removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index communities_map_idx on app_private.communities using gist(location);
create index communities_area_idx on app_private.communities(area, created_at desc) where moderation_state='published';
create index communities_creator_idx on app_private.communities(creator_id, created_at desc);

create table app_private.community_memberships (
  community_id uuid not null references app_private.communities(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member')),
  status text not null default 'active' check (status in ('active','left','removed')),
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(community_id, user_id)
);
create index community_memberships_user_idx on app_private.community_memberships(user_id, status, joined_at desc);

alter table app_private.local_posts
  add column community_id uuid references app_private.communities(id) on delete set null;
create index local_posts_community_idx on app_private.local_posts(community_id, created_at desc)
  where moderation_state='published';

alter table app_private.signals
  add column community_id uuid references app_private.communities(id) on delete set null;
create index signals_community_idx on app_private.signals(community_id, starts_at desc);

alter table app_private.communities enable row level security;
alter table app_private.community_memberships enable row level security;
revoke all on app_private.communities, app_private.community_memberships from public, anon, authenticated;

create or replace function app_private.project_community(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select jsonb_build_object(
    'id', c.id,
    'name', c.name,
    'description', c.description,
    'category', c.category,
    'place_id', c.place_id,
    'place_name', coalesce(p.name,''),
    'area', c.area,
    'longitude', c.longitude,
    'latitude', c.latitude,
    'created_at', c.created_at,
    'member_count', (
      select count(*) from app_private.community_memberships m
      where m.community_id=c.id and m.status='active'
    ),
    'viewer_is_member', case when auth.uid() is null then false else exists(
      select 1 from app_private.community_memberships m
      where m.community_id=c.id and m.user_id=auth.uid() and m.status='active'
    ) end,
    'viewer_role', case when auth.uid() is null then null else (
      select m.role from app_private.community_memberships m
      where m.community_id=c.id and m.user_id=auth.uid() and m.status='active'
    ) end,
    'creator', jsonb_build_object(
      'id', pr.id,
      'display_name', pr.display_name,
      'role', pr.role,
      'organizer_label', coalesce(pr.organizer_label,'')
    )
  )
  from app_private.communities c
  join app_private.profiles pr on pr.id=c.creator_id
  left join public.places p on p.id=c.place_id
  where c.id=p_id and c.moderation_state='published';
$$;

create or replace function public.discover_communities(p_bounds jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  w double precision := (p_bounds->>'west')::double precision;
  e double precision := (p_bounds->>'east')::double precision;
  n double precision := (p_bounds->>'north')::double precision;
  s double precision := (p_bounds->>'south')::double precision;
  result jsonb;
begin
  if w is null or e is null or n is null or s is null
    or not(w>=-180 and e<=180 and s>=-90 and n<=90 and e>w and n>s and e-w<=0.25 and n-s<=0.25) then
    raise exception using errcode='VS005',message='invalid bounds';
  end if;
  select coalesce(jsonb_agg(q.item order by q.created_at desc, q.id), '[]'::jsonb)
  into result
  from (
    select app_private.project_community(c.id) item, c.created_at, c.id
    from app_private.communities c
    where c.moderation_state='published'
      and extensions.st_intersects(
        c.location,
        extensions.st_makeenvelope(w,s,e,n,4326)::extensions.geography
      )
    order by c.created_at desc, c.id
    limit 60
  ) q;
  return result;
end; $$;

create or replace function public.get_community(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select app_private.project_community(p_id);
$$;

create or replace function public.get_community_posts(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select coalesce(jsonb_agg(q.item order by q.created_at desc), '[]'::jsonb)
  from (
    select app_private.project_local_post(lp.id) item, lp.created_at
    from app_private.local_posts lp
    join app_private.communities c on c.id=lp.community_id
    where lp.community_id=p_id
      and lp.moderation_state='published'
      and c.moderation_state='published'
    order by lp.created_at desc
    limit 50
  ) q;
$$;

create or replace function public.create_community(p_input jsonb)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  actor uuid := auth.uid();
  result uuid;
  v_place public.places;
  v_place_id uuid;
  v_area text;
  v_lng double precision;
  v_lat double precision;
  v_name text := trim(coalesce(p_input->>'name',''));
  v_description text := trim(coalesce(p_input->>'description',''));
  v_category text := p_input->>'category';
begin
  if actor is null then raise exception using errcode='VS001',message='authentication required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text, 7));
  if exists(select 1 from jsonb_object_keys(p_input) k where k not in ('name','description','category','place_id','area')) then
    raise exception using errcode='VS005',message='unknown fields';
  end if;
  if length(v_name) not between 3 and 80 or length(v_description)>600
     or v_category not in ('neighborhood','sport','hobby','learning','professional','culture','volunteer','other') then
    raise exception using errcode='VS005',message='invalid community';
  end if;
  if (case when nullif(p_input->>'place_id','') is not null then 1 else 0 end)
     + (case when nullif(trim(coalesce(p_input->>'area','')),'') is not null then 1 else 0 end) <> 1 then
    raise exception using errcode='VS005',message='choose one safe location target';
  end if;
  if nullif(p_input->>'place_id','') is not null then
    v_place_id := (p_input->>'place_id')::uuid;
    select * into v_place from public.places where id=v_place_id and enabled and city_id='hcm';
    if v_place.id is null then raise exception using errcode='VS005',message='invalid public place'; end if;
    v_area := v_place.area;
    v_lng := v_place.longitude;
    v_lat := v_place.latitude;
  else
    v_area := trim(p_input->>'area');
    select avg(longitude), avg(latitude) into v_lng,v_lat
    from public.places where enabled and city_id='hcm' and area=v_area;
    if v_lng is null or v_lat is null then raise exception using errcode='VS005',message='unknown safe area'; end if;
  end if;
  if (select count(*) from app_private.communities where creator_id=actor and created_at>now()-interval '1 day') >= 2 then
    raise exception using errcode='VS006',message='community create rate limit';
  end if;
  insert into app_private.communities(creator_id,name,description,category,place_id,area,longitude,latitude)
  values(actor,v_name,v_description,v_category,v_place_id,v_area,v_lng,v_lat)
  returning id into result;
  insert into app_private.community_memberships(community_id,user_id,role,status)
  values(result,actor,'owner','active');
  return result;
exception
  when check_violation or not_null_violation or invalid_text_representation then
    raise exception using errcode='VS005',message='invalid community';
end; $$;

create or replace function public.set_community_membership(p_id uuid, p_join boolean)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  actor uuid := auth.uid();
  v_role text;
  total integer;
begin
  if actor is null then raise exception using errcode='VS001',message='authentication required'; end if;
  if not exists(select 1 from app_private.communities where id=p_id and moderation_state='published') then
    raise exception using errcode='VS003',message='community unavailable';
  end if;
  select role into v_role from app_private.community_memberships
  where community_id=p_id and user_id=actor and status='active';
  if p_join then
    insert into app_private.community_memberships(community_id,user_id,role,status,updated_at)
    values(p_id,actor,'member','active',now())
    on conflict(community_id,user_id) do update set status='active',updated_at=now();
  else
    if v_role='owner' then raise exception using errcode='VS005',message='owner cannot leave community'; end if;
    update app_private.community_memberships set status='left',updated_at=now()
    where community_id=p_id and user_id=actor;
  end if;
  select count(*) into total from app_private.community_memberships
  where community_id=p_id and status='active';
  return jsonb_build_object('joined',p_join,'member_count',total);
end; $$;

-- Extend Local Posts so a Community can be the safe social/location context.
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
    'community', case when cm.id is null then null else jsonb_build_object('id',cm.id,'name',cm.name) end,
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
  left join app_private.communities cm on cm.id=lp.community_id and cm.moderation_state='published'
  where lp.id=p_id and lp.moderation_state='published';
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
  v_community app_private.communities;
  v_place_id uuid;
  v_community_id uuid;
  v_area text;
  v_lng double precision;
  v_lat double precision;
  v_body text := trim(coalesce(p_input->>'body',''));
  v_type text := p_input->>'post_type';
  v_targets integer;
begin
  if actor is null then raise exception using errcode='VS001',message='authentication required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text,3));
  select id into existing from app_private.local_posts
  where author_id=actor and request_id=(p_input->>'request_id')::uuid;
  if existing is not null then return existing; end if;
  if exists(select 1 from jsonb_object_keys(p_input) k where k not in ('request_id','post_type','body','place_id','area','community_id')) then
    raise exception using errcode='VS005',message='unknown fields';
  end if;
  if v_type not in ('question','update','recommendation') or length(v_body) not between 8 and 800 then
    raise exception using errcode='VS005',message='invalid local post';
  end if;
  v_targets := (case when nullif(p_input->>'place_id','') is not null then 1 else 0 end)
    + (case when nullif(trim(coalesce(p_input->>'area','')),'') is not null then 1 else 0 end)
    + (case when nullif(p_input->>'community_id','') is not null then 1 else 0 end);
  if v_targets<>1 then raise exception using errcode='VS005',message='choose one safe context'; end if;

  if nullif(p_input->>'community_id','') is not null then
    v_community_id := (p_input->>'community_id')::uuid;
    select * into v_community from app_private.communities where id=v_community_id and moderation_state='published';
    if v_community.id is null then raise exception using errcode='VS003',message='community unavailable'; end if;
    if not exists(select 1 from app_private.community_memberships where community_id=v_community_id and user_id=actor and status='active') then
      raise exception using errcode='VS002',message='join community before posting';
    end if;
    v_place_id := v_community.place_id;
    v_area := v_community.area;
    v_lng := v_community.longitude;
    v_lat := v_community.latitude;
  elsif nullif(p_input->>'place_id','') is not null then
    v_place_id := (p_input->>'place_id')::uuid;
    select * into v_place from public.places where id=v_place_id and enabled and city_id='hcm';
    if v_place.id is null then raise exception using errcode='VS005',message='invalid public place'; end if;
    v_area := v_place.area; v_lng := v_place.longitude; v_lat := v_place.latitude;
  else
    v_area := trim(p_input->>'area');
    select avg(longitude),avg(latitude) into v_lng,v_lat from public.places
    where enabled and city_id='hcm' and area=v_area;
    if v_lng is null or v_lat is null then raise exception using errcode='VS005',message='unknown safe area'; end if;
  end if;
  if (select count(*) from app_private.local_posts where author_id=actor and created_at>now()-interval '1 day')>=5 then
    raise exception using errcode='VS006',message='local post rate limit';
  end if;
  insert into app_private.local_posts(author_id,request_id,post_type,body,place_id,community_id,area,longitude,latitude)
  values(actor,(p_input->>'request_id')::uuid,v_type,v_body,v_place_id,v_community_id,v_area,v_lng,v_lat)
  returning id into result;
  return result;
exception
  when check_violation or not_null_violation or invalid_text_representation then
    raise exception using errcode='VS005',message='invalid local post';
end; $$;

create or replace function public.moderate_community(p_id uuid, p_action text)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if not exists(select 1 from app_private.profiles where id=auth.uid() and role='moderator') then
    raise exception using errcode='VS002',message='moderator required';
  end if;
  if p_action not in ('quarantine','remove','restore') then raise exception using errcode='VS005',message='invalid moderation action'; end if;
  update app_private.communities
  set moderation_state=case p_action when 'quarantine' then 'quarantined' when 'remove' then 'removed' else 'published' end,
      updated_at=now()
  where id=p_id;
  if not found then raise exception using errcode='VS003',message='community unavailable'; end if;
end; $$;

revoke all on function app_private.project_community(uuid) from public,anon,authenticated;
revoke all on function public.discover_communities(jsonb), public.get_community(uuid), public.get_community_posts(uuid),
  public.create_community(jsonb), public.set_community_membership(uuid,boolean), public.moderate_community(uuid,text)
from public,anon,authenticated;

grant execute on function public.discover_communities(jsonb), public.get_community(uuid), public.get_community_posts(uuid)
to anon,authenticated;
grant execute on function public.create_community(jsonb), public.set_community_membership(uuid,boolean), public.moderate_community(uuid,text)
to authenticated;
