-- Vietnam Social Phase E1: unified social-map measurement and evidence integrity.
-- Client observations are not authoritative social actions. Fixture Places are explicit provenance.

-- ---------------------------------------------------------------------------
-- 1. Place provenance: deterministic fixtures are never real production supply.
-- ---------------------------------------------------------------------------
alter table public.places
  add column if not exists data_origin text not null default 'real';

alter table public.places
  drop constraint if exists places_data_origin_check;
alter table public.places
  add constraint places_data_origin_check check (data_origin in ('real','fixture'));

update public.places
set data_origin='fixture'
where id in (
  '10000000-0000-4000-8000-000000000001'::uuid,
  '10000000-0000-4000-8000-000000000002'::uuid,
  '10000000-0000-4000-8000-000000000003'::uuid
);

create index if not exists places_real_enabled_area_idx
  on public.places(city_id, area, name)
  where enabled and data_origin='real';

-- ---------------------------------------------------------------------------
-- 2. Server-owned test actor registry. No browser field can opt into test/demo.
-- ---------------------------------------------------------------------------
create table if not exists app_private.analytics_test_actors (
  actor_id uuid primary key references auth.users(id) on delete cascade,
  reason text not null default 'automated_test' check (length(reason) between 1 and 120),
  created_at timestamptz not null default now()
);
alter table app_private.analytics_test_actors enable row level security;
revoke all on app_private.analytics_test_actors from public, anon, authenticated;

create or replace function app_private.traffic_class_for_actor(p_actor uuid)
returns text
language sql
stable
security definer
set search_path=''
as $$
  select case
    when p_actor is not null and exists(
      select 1 from app_private.analytics_test_actors t where t.actor_id=p_actor
    ) then 'test'
    else 'real'
  end;
$$;
revoke all on function app_private.traffic_class_for_actor(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Evolve legacy analytics without rewriting unverifiable historical truth.
-- ---------------------------------------------------------------------------
alter table app_private.analytics_events
  add column if not exists subject_type text,
  add column if not exists subject_id text,
  add column if not exists event_source text,
  add column if not exists traffic_class text;

update app_private.analytics_events
set
  event_source = coalesce(event_source, 'legacy_client'),
  traffic_class = coalesce(
    traffic_class,
    case
      when is_test then 'test'
      when is_demo then 'demo'
      else 'unverified_legacy'
    end
  );

alter table app_private.analytics_events
  alter column event_source set default 'legacy_client',
  alter column event_source set not null,
  alter column traffic_class set default 'unverified_legacy',
  alter column traffic_class set not null;

alter table app_private.analytics_events
  drop constraint if exists analytics_events_event_source_check;
alter table app_private.analytics_events
  add constraint analytics_events_event_source_check
  check (event_source in ('client_observation','authoritative_action','legacy_client'));

alter table app_private.analytics_events
  drop constraint if exists analytics_events_traffic_class_check;
alter table app_private.analytics_events
  add constraint analytics_events_traffic_class_check
  check (traffic_class in ('real','test','demo','unverified_legacy'));

create index if not exists analytics_events_subject_time_idx
  on app_private.analytics_events(subject_type, subject_id, created_at desc);
create index if not exists analytics_events_traffic_time_idx
  on app_private.analytics_events(traffic_class, created_at desc, event_type);

-- ---------------------------------------------------------------------------
-- 4. Authoritative action ledger. Written only by successful DB mutations.
-- ---------------------------------------------------------------------------
create table if not exists app_private.social_action_events (
  id bigint generated always as identity primary key,
  actor_id uuid not null references auth.users(id) on delete cascade,
  action_type text not null check (action_type in (
    'local_post_comment',
    'person_follow',
    'community_join',
    'activity_join',
    'activity_go',
    'activity_confirm',
    'place_follow',
    'area_follow'
  )),
  subject_type text not null check (subject_type in ('local_post','person','community','activity','place','area')),
  subject_id text not null check (length(subject_id) between 1 and 200),
  city_id text references public.cities(id),
  area text,
  traffic_class text not null check (traffic_class in ('real','test')),
  created_at timestamptz not null default now()
);
alter table app_private.social_action_events enable row level security;
revoke all on app_private.social_action_events from public, anon, authenticated;
create index if not exists social_action_events_actor_time_idx
  on app_private.social_action_events(actor_id, created_at desc);
create index if not exists social_action_events_type_time_idx
  on app_private.social_action_events(action_type, traffic_class, created_at desc);

create or replace function app_private.record_social_action(
  p_action_type text,
  p_subject_type text,
  p_subject_id text,
  p_city_id text default null,
  p_area text default null
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  actor uuid := auth.uid();
  v_class text;
begin
  if actor is null then
    raise exception using errcode='VS001',message='authentication required';
  end if;
  v_class := app_private.traffic_class_for_actor(actor);
  insert into app_private.social_action_events(
    actor_id,action_type,subject_type,subject_id,city_id,area,traffic_class
  ) values(
    actor,p_action_type,p_subject_type,p_subject_id,p_city_id,nullif(trim(coalesce(p_area,'')),''),v_class
  );
end;
$$;
revoke all on function app_private.record_social_action(text,text,text,text,text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Client observations: reject evidence-classification spoofing and GPS.
-- ---------------------------------------------------------------------------
create or replace function public.record_client_event(p_event jsonb)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  actor uuid := auth.uid();
  v_type text := p_event->>'type';
  v_city_id text := coalesce(p_event->>'city_id', 'hcm');
  v_signal_id uuid := null;
  v_session text := coalesce(nullif(trim(p_event->>'session_id'),''), 'anonymous');
  v_qualified boolean := coalesce((p_event->>'is_qualified')::boolean, false);
  v_subject_type text := nullif(trim(p_event->>'subject_type'),'');
  v_subject_id text := nullif(trim(p_event->>'subject_id'),'');
  v_class text := app_private.traffic_class_for_actor(actor);
begin
  if p_event is null or jsonb_typeof(p_event) <> 'object' then
    raise exception using errcode='VS005',message='invalid event';
  end if;

  if exists (
    select 1 from jsonb_object_keys(p_event) k
    where k in (
      'latitude','longitude','lat','lng','coords','location',
      'is_test','is_demo','traffic_class','event_source','actor_id','author_id','role'
    )
  ) then
    raise exception using errcode='VS005',message='client event contains forbidden fields';
  end if;

  if exists (
    select 1 from jsonb_object_keys(p_event) k
    where k not in (
      'type','city_id','session_id','is_qualified','timestamp','duration_ms',
      'signal_id','category','area_name','coarse_h3','subject_type','subject_id','filter'
    )
  ) then
    raise exception using errcode='VS005',message='unknown client event fields';
  end if;

  if v_type not in (
    'map_opened','map_viewport_changed','map_filter_changed','map_entity_impression','map_entity_opened',
    'area_selected','signal_impression','signal_opened','join_clicked','go_clicked','share_clicked',
    'confirmation_submitted','not_there_submitted','report_submitted',
    'local_post_opened','profile_opened','community_opened','place_opened','area_opened'
  ) then
    raise exception using errcode='VS005',message='unsupported client observation';
  end if;

  if length(v_session) > 64 then
    raise exception using errcode='VS005',message='invalid session';
  end if;

  if not exists(select 1 from public.cities c where c.id=v_city_id and c.active) then
    raise exception using errcode='VS005',message='invalid city';
  end if;

  if p_event->>'signal_id' is not null then
    v_signal_id := (p_event->>'signal_id')::uuid;
  end if;

  insert into app_private.analytics_events(
    event_type,city_id,signal_id,actor_id,session_id,is_qualified,is_demo,is_test,
    subject_type,subject_id,event_source,traffic_class,metadata
  ) values(
    v_type,v_city_id,v_signal_id,actor,v_session,v_qualified,false,(v_class='test'),
    v_subject_type,v_subject_id,'client_observation',v_class,p_event
  );
exception
  when invalid_text_representation then
    raise exception using errcode='VS005',message='invalid client observation';
end;
$$;

revoke all on function public.record_client_event(jsonb) from public, anon, authenticated;
grant execute on function public.record_client_event(jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Real Place/Area projections must ignore fixtures.
-- ---------------------------------------------------------------------------
create or replace function app_private.canonical_area(p_city_id text, p_area text)
returns text
language sql
stable
security definer
set search_path=''
as $$
  select trim(p.area)
  from public.places p
  join public.cities c on c.id=p.city_id
  where p.city_id=p_city_id
    and p.enabled
    and p.data_origin='real'
    and c.active
    and lower(trim(p.area))=lower(trim(p_area))
  order by trim(p.area) collate "C"
  limit 1;
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
    'id',p.id,'city_id',p.city_id,'name',p.name,
    'area',app_private.canonical_area(p.city_id,p.area),
    'longitude',p.longitude,'latitude',p.latitude,'h3_parent',p.h3_parent,
    'follower_count',(select count(*) from app_private.place_follows f where f.place_id=p.id),
    'area_follower_count',(
      select count(*) from app_private.area_follows f
      where f.city_id=p.city_id and f.area=app_private.canonical_area(p.city_id,p.area)
    ),
    'viewer_follows',case when auth.uid() is null then false else exists(
      select 1 from app_private.place_follows f where f.user_id=auth.uid() and f.place_id=p.id
    ) end,
    'viewer_follows_area',case when auth.uid() is null then false else exists(
      select 1 from app_private.area_follows f
      where f.user_id=auth.uid() and f.city_id=p.city_id and f.area=app_private.canonical_area(p.city_id,p.area)
    ) end
  )
  from public.places p
  join public.cities c on c.id=p.city_id
  where p.id=p_id and p.enabled and p.data_origin='real' and c.active;
$$;
revoke all on function app_private.project_place_social(uuid) from public,anon,authenticated;

-- ---------------------------------------------------------------------------
-- 7. Authoritative qualifying actions: record only when durable state changed.
-- ---------------------------------------------------------------------------
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
  v_area text;
begin
  if actor is null then raise exception using errcode='VS001',message='authentication required'; end if;
  select area into v_area from app_private.local_posts where id=p_id and moderation_state='published';
  if v_area is null then raise exception using errcode='VS003',message='post unavailable'; end if;
  if length(v_body) not between 1 and 500 then raise exception using errcode='VS005',message='invalid comment'; end if;
  if (select count(*) from app_private.local_post_comments where author_id=actor and created_at>now()-interval '1 hour') >= 20 then
    raise exception using errcode='VS006',message='comment rate limit';
  end if;
  insert into app_private.local_post_comments(post_id,author_id,body)
  values(p_id,actor,v_body) returning id into result;
  perform app_private.record_social_action('local_post_comment','local_post',p_id::text,'hcm',v_area);
  return result;
end;
$$;

create or replace function public.set_follow(p_user_id uuid, p_follow boolean)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  actor uuid := auth.uid();
  followers integer;
  changed integer := 0;
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
    get diagnostics changed = row_count;
    if changed>0 then
      perform app_private.record_social_action('person_follow','person',p_user_id::text,null,null);
    end if;
  else
    delete from app_private.follows where follower_id=actor and following_id=p_user_id;
  end if;
  select count(*) into followers from app_private.follows where following_id=p_user_id;
  return jsonb_build_object('following',p_follow,'follower_count',followers);
end;
$$;

create or replace function public.set_community_membership(p_id uuid, p_join boolean)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  actor uuid := auth.uid();
  v_role text;
  v_area text;
  was_active boolean;
  total integer;
begin
  if actor is null then raise exception using errcode='VS001',message='authentication required'; end if;
  select area into v_area from app_private.communities where id=p_id and moderation_state='published';
  if v_area is null then raise exception using errcode='VS003',message='community unavailable'; end if;
  select role,status='active' into v_role,was_active
  from app_private.community_memberships where community_id=p_id and user_id=actor;
  was_active := coalesce(was_active,false);
  if p_join then
    insert into app_private.community_memberships(community_id,user_id,role,status,updated_at)
    values(p_id,actor,'member','active',now())
    on conflict(community_id,user_id) do update set status='active',updated_at=now();
    if not was_active then
      perform app_private.record_social_action('community_join','community',p_id::text,'hcm',v_area);
    end if;
  else
    if v_role='owner' then raise exception using errcode='VS005',message='owner cannot leave community'; end if;
    update app_private.community_memberships set status='left',updated_at=now()
    where community_id=p_id and user_id=actor;
  end if;
  select count(*) into total from app_private.community_memberships where community_id=p_id and status='active';
  return jsonb_build_object('joined',p_join,'member_count',total);
end;
$$;

create or replace function public.set_place_follow(p_place_id uuid, p_follow boolean)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  actor uuid := auth.uid();
  total integer;
  changed integer := 0;
  v_city text;
  v_area text;
begin
  if actor is null then raise exception using errcode='VS001',message='authentication required'; end if;
  if p_follow is null then raise exception using errcode='VS003',message='follow must be boolean'; end if;
  select p.city_id,p.area into v_city,v_area
  from public.places p join public.cities c on c.id=p.city_id
  where p.id=p_place_id and p.enabled and p.data_origin='real' and c.active;
  if v_city is null then raise exception using errcode='VS003',message='place unavailable'; end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text || p_place_id::text,11));
  if p_follow then
    insert into app_private.place_follows(user_id,place_id) values(actor,p_place_id)
    on conflict(user_id,place_id) do nothing;
    get diagnostics changed = row_count;
    if changed>0 then
      perform app_private.record_social_action('place_follow','place',p_place_id::text,v_city,v_area);
    end if;
  else
    delete from app_private.place_follows where user_id=actor and place_id=p_place_id;
  end if;
  select count(*) into total from app_private.place_follows where place_id=p_place_id;
  return jsonb_build_object('following',p_follow,'follower_count',total);
end;
$$;

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
  changed integer := 0;
begin
  if actor is null then raise exception using errcode='VS001',message='authentication required'; end if;
  if p_follow is null then raise exception using errcode='VS003',message='follow must be boolean'; end if;
  canonical_area := app_private.canonical_area(p_city_id,p_area);
  if canonical_area is null then raise exception using errcode='VS003',message='area unavailable'; end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text || p_city_id || canonical_area,12));
  if p_follow then
    insert into app_private.area_follows(user_id,city_id,area)
    values(actor,p_city_id,canonical_area)
    on conflict(user_id,city_id,area) do nothing;
    get diagnostics changed = row_count;
    if changed>0 then
      perform app_private.record_social_action('area_follow','area',p_city_id || ':' || canonical_area,p_city_id,canonical_area);
    end if;
  else
    delete from app_private.area_follows where user_id=actor and city_id=p_city_id and area=canonical_area;
  end if;
  select count(*) into total from app_private.area_follows where city_id=p_city_id and area=canonical_area;
  return jsonb_build_object('following',p_follow,'follower_count',total,'city_id',p_city_id,'area',canonical_area);
end;
$$;

create or replace function public.act_on_signal(p_id uuid,p_action text,p_reason text default '')
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  actor uuid:=auth.uid();
  sig app_private.signals;
  bucket text;
  old_value text;
  v_city text;
  v_area text;
begin
  if actor is null then raise exception using errcode='VS001',message='authentication required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
  select * into sig from app_private.signals where id=p_id for update;
  if sig.id is null or sig.status<>'active' or sig.expires_at<=now() then
    raise exception using errcode='VS003',message='activity unavailable';
  end if;
  select city_id,area into v_city,v_area from public.places where id=sig.place_id and enabled and data_origin='real';
  if p_action not in ('resolve','remove') and (sig.starts_at>now()+interval '6 hours' or v_city is null) then
    raise exception using errcode='VS003',message='activity unavailable';
  end if;
  if p_action='resolve' or p_action='remove' then
    if (p_action='resolve' and sig.author_id<>actor) or
       (p_action='remove' and not exists(select 1 from app_private.profiles where id=actor and role='moderator')) then
      raise exception using errcode='VS002',message='forbidden';
    end if;
    update app_private.signals set status=case when p_action='resolve' then 'resolved' else 'removed' end where id=p_id;
  else
    if p_action not in ('join','go','confirm','not_there','report') or p_action is null or length(p_reason)>300 then
      raise exception using errcode='VS005',message='invalid action';
    end if;
    if actor=sig.author_id and p_action in ('confirm','not_there') then
      raise exception using errcode='VS004',message='self verification forbidden';
    end if;
    bucket:=case when p_action in ('join','go') then 'attendance' when p_action in ('confirm','not_there') then 'verification' else 'report' end;
    select value into old_value from app_private.actions where signal_id=p_id and user_id=actor and kind=bucket;
    if old_value=p_action then return; end if;
    if (select count(*) from app_private.audit_events where actor_id=actor and created_at>now()-interval '1 minute')>=30 then
      raise exception using errcode='VS006',message='action rate limit';
    end if;
    insert into app_private.actions(signal_id,user_id,kind,value,reason)
    values(p_id,actor,bucket,p_action,coalesce(p_reason,''))
    on conflict(signal_id,user_id,kind) do update set value=excluded.value,reason=excluded.reason,updated_at=now();
    if p_action='join' then
      perform app_private.record_social_action('activity_join','activity',p_id::text,v_city,v_area);
    elsif p_action='go' then
      perform app_private.record_social_action('activity_go','activity',p_id::text,v_city,v_area);
    elsif p_action='confirm' then
      perform app_private.record_social_action('activity_confirm','activity',p_id::text,v_city,v_area);
    end if;
  end if;
  insert into app_private.audit_events(signal_id,actor_id,reason_code) values(p_id,actor,p_action);
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Moderator-only social metrics. WMLC_v0 uses authoritative action facts only.
-- ISO week boundaries are evaluated in Asia/Ho_Chi_Minh.
-- ---------------------------------------------------------------------------
create or replace function public.social_metrics()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  actor uuid := auth.uid();
  week_start timestamptz := (date_trunc('week', now() at time zone 'Asia/Ho_Chi_Minh') at time zone 'Asia/Ho_Chi_Minh');
  week_end timestamptz := week_start + interval '7 days';
  result jsonb;
begin
  if actor is null then raise exception using errcode='VS001',message='authentication required'; end if;
  if not exists(select 1 from app_private.profiles where id=actor and role='moderator') then
    raise exception using errcode='VS002',message='moderator required';
  end if;

  select jsonb_build_object(
    'metric_version','WMLC_v0',
    'week_start',week_start,
    'week_end',week_end,
    'wmlc_v0',(
      select count(distinct sae.actor_id)
      from app_private.social_action_events sae
      where sae.traffic_class='real' and sae.created_at>=week_start and sae.created_at<week_end
    ),
    'unique_social_users_7d',(
      select count(distinct sae.actor_id) from app_private.social_action_events sae
      where sae.traffic_class='real' and sae.created_at>=now()-interval '7 days'
    ),
    'map_sessions_7d',(
      select count(distinct ae.session_id) from app_private.analytics_events ae
      where ae.traffic_class='real' and ae.event_source='client_observation'
        and ae.event_type='map_opened' and ae.created_at>=now()-interval '7 days'
    ),
    'entity_opens_7d',coalesce((
      select jsonb_object_agg(coalesce(subject_type,'unknown'),cnt)
      from (
        select subject_type,count(*) cnt
        from app_private.analytics_events
        where traffic_class='real' and event_source='client_observation'
          and event_type in ('map_entity_opened','local_post_opened','community_opened','signal_opened','place_opened','profile_opened','area_opened')
          and created_at>=now()-interval '7 days'
        group by subject_type
      ) q
    ),'{}'::jsonb),
    'posts_created_7d',(
      select count(*) from app_private.local_posts lp
      where lp.created_at>=now()-interval '7 days'
        and not exists(select 1 from app_private.analytics_test_actors t where t.actor_id=lp.author_id)
    ),
    'comments_7d',(
      select count(*) from app_private.social_action_events where traffic_class='real'
        and action_type='local_post_comment' and created_at>=now()-interval '7 days'
    ),
    'community_joins_7d',(
      select count(*) from app_private.social_action_events where traffic_class='real'
        and action_type='community_join' and created_at>=now()-interval '7 days'
    ),
    'activity_join_go_7d',(
      select count(*) from app_private.social_action_events where traffic_class='real'
        and action_type in ('activity_join','activity_go') and created_at>=now()-interval '7 days'
    ),
    'person_follows_7d',(
      select count(*) from app_private.social_action_events where traffic_class='real'
        and action_type='person_follow' and created_at>=now()-interval '7 days'
    ),
    'place_follows_7d',(
      select count(*) from app_private.social_action_events where traffic_class='real'
        and action_type='place_follow' and created_at>=now()-interval '7 days'
    ),
    'area_follows_7d',(
      select count(*) from app_private.social_action_events where traffic_class='real'
        and action_type='area_follow' and created_at>=now()-interval '7 days'
    ),
    'distinct_active_areas_7d',(
      select count(distinct (city_id,area)) from app_private.social_action_events
      where traffic_class='real' and area is not null and created_at>=now()-interval '7 days'
    ),
    'distinct_real_contributors_7d',(
      select count(distinct lp.author_id) from app_private.local_posts lp
      where lp.created_at>=now()-interval '7 days'
        and not exists(select 1 from app_private.analytics_test_actors t where t.actor_id=lp.author_id)
    ),
    'real_enabled_places',(
      select count(*) from public.places where enabled and data_origin='real'
    ),
    'fixture_places',(
      select count(*) from public.places where data_origin='fixture'
    )
  ) into result;
  return result;
end;
$$;

revoke all on function public.social_metrics() from public,anon,authenticated;
grant execute on function public.social_metrics() to authenticated;

-- Re-assert grants for functions replaced above.
revoke all on function public.comment_local_post(uuid,text),
  public.set_follow(uuid,boolean),
  public.set_community_membership(uuid,boolean),
  public.set_place_follow(uuid,boolean),
  public.set_area_follow(text,text,boolean),
  public.act_on_signal(uuid,text,text)
from public,anon,authenticated;

grant execute on function public.comment_local_post(uuid,text),
  public.set_follow(uuid,boolean),
  public.set_community_membership(uuid,boolean),
  public.set_place_follow(uuid,boolean),
  public.set_area_follow(text,text,boolean),
  public.act_on_signal(uuid,text,text)
to authenticated;
