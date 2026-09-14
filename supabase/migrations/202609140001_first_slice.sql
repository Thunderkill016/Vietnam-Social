-- Vietnam Social: venue-only first slice. No personal GPS is accepted or stored.
create schema if not exists extensions;
create extension if not exists postgis with schema extensions;
create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;

create table public.cities (
  id text primary key,
  name text not null,
  pilot_bounds extensions.geometry(Polygon,4326) not null
);
create table public.places (
  id uuid primary key default gen_random_uuid(),
  city_id text not null references public.cities(id),
  name text not null check (length(name) between 2 and 120),
  area text not null,
  longitude double precision not null check (longitude between -180 and 180),
  latitude double precision not null check (latitude between -90 and 90),
  location extensions.geography(Point,4326) generated always as
    (extensions.st_setsrid(extensions.st_makepoint(longitude,latitude),4326)::extensions.geography) stored,
  -- H3 resolution 6 is a coarse broadcast partition, never a query authority.
  h3_parent text not null check (h3_parent ~ '^86[0-9a-f]{13}$'),
  enabled boolean not null default true
);
create index places_location_gist on public.places using gist(location);
create table app_private.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Thành viên' check (length(display_name) between 1 and 80),
  role text not null default 'member' check (role in ('member','host','moderator'))
);
create table app_private.signals (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  place_id uuid not null references public.places(id),
  type text not null default 'ACTIVITY' check (type = 'ACTIVITY'),
  title text not null check (length(trim(title)) between 8 and 100),
  description text not null default '' check (length(description) <= 600),
  category text not null check (category in ('sport','music','workshop','community')),
  capacity_note text not null default '' check (length(capacity_note) <= 100),
  starts_at timestamptz not null,
  expires_at timestamptz not null,
  status text not null default 'active' check (status in ('active','resolved','removed')),
  created_at timestamptz not null default now(),
  check (expires_at > starts_at and expires_at <= starts_at + interval '24 hours'),
  unique(author_id, request_id)
);
create index signals_active_window on app_private.signals(place_id, starts_at, expires_at) where status = 'active';
create table app_private.actions (
  signal_id uuid not null references app_private.signals(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- confirm/not_there share one key so a user cannot vote both ways.
  kind text not null check (kind in ('attendance','verification','report')),
  value text not null check (value in ('join','go','confirm','not_there','report')),
  reason text not null default '' check (length(reason) <= 300),
  updated_at timestamptz not null default now(),
  primary key(signal_id,user_id,kind),
  check ((kind='attendance' and value in ('join','go')) or (kind='verification' and value in ('confirm','not_there')) or (kind='report' and value='report'))
);
create index actions_user_time on app_private.actions(user_id,updated_at);
create table app_private.audit_events (
  id bigint generated always as identity primary key,
  signal_id uuid references app_private.signals(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  reason_code text not null,
  created_at timestamptz not null default now()
);
create index audit_rate_limit on app_private.audit_events(actor_id,created_at);

alter table public.cities enable row level security;
alter table public.places enable row level security;
alter table app_private.profiles enable row level security;
alter table app_private.signals enable row level security;
alter table app_private.actions enable row level security;
alter table app_private.audit_events enable row level security;
revoke all on public.cities, public.places from anon, authenticated;
grant select on public.cities, public.places to anon, authenticated;
create policy cities_read on public.cities for select to anon,authenticated using (true);
create policy places_read on public.places for select to anon,authenticated using (enabled);

create function app_private.new_user() returns trigger language plpgsql security definer set search_path='' as $$
begin
  -- Never take authorization roles from user-editable auth metadata.
  insert into app_private.profiles(id) values(new.id);
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function app_private.new_user();

create function public.viewer_profile() returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('id',id,'role',role,'display_name',display_name) from app_private.profiles where id=auth.uid();
$$;

-- Public projection contains no author UUID, attendee identities, reports or raw trust inputs.
create function app_private.project_signal(p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'id',s.id,'title',s.title,'description',s.description,'category',s.category,
    'place_id',p.id,'place_name',p.name,'area',p.area,'longitude',p.longitude,'latitude',p.latitude,
    'starts_at',s.starts_at,'expires_at',s.expires_at,'source_label',pr.display_name,
    'capacity_note',s.capacity_note,'h3_parent',p.h3_parent,
    'confirmation_count',v.confirmations,
    -- v0 rule: >=2 negative reports block positive confidence. Community agreement is not a guarantee.
    'confidence',case when v.negatives >= 2 then 'questionable'
      when v.confirmations >= 3 then 'verified' when v.confirmations >= 1 then 'likely' else 'unconfirmed' end
  )
  from app_private.signals s join public.places p on p.id=s.place_id
  join app_private.profiles pr on pr.id=s.author_id
  cross join lateral (select count(*) filter(where value='confirm') as confirmations,
    count(*) filter(where value='not_there') as negatives from app_private.actions a where a.signal_id=s.id) v
  where s.id=p_id and s.status='active' and s.expires_at>now()
    and s.starts_at<=now()+interval '6 hours' and p.enabled;
$$;
create function public.get_signal(p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
  select app_private.project_signal(p_id);
$$;
create function public.discover_signals(p_bounds jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare w double precision; e double precision; n double precision; s double precision; result jsonb;
begin
  w:=(p_bounds->>'west')::double precision; e:=(p_bounds->>'east')::double precision;
  n:=(p_bounds->>'north')::double precision; s:=(p_bounds->>'south')::double precision;
  if w is null or e is null or n is null or s is null or not(w>=-180 and e<=180 and s>=-90 and n<=90 and e>w and n>s and e-w<=0.25 and n-s<=0.25) then
    raise exception using errcode='VS005',message='invalid bounds';
  end if;
  select coalesce(jsonb_agg(q.item order by q.starts_at,q.id),'[]'::jsonb) into result from (
    select app_private.project_signal(sig.id) item,sig.starts_at,sig.id
    from app_private.signals sig join public.places p on p.id=sig.place_id
    where sig.status='active' and sig.expires_at>now() and sig.starts_at<=now()+interval '6 hours' and p.enabled
      and extensions.st_intersects(p.location,extensions.st_makeenvelope(w,s,e,n,4326)::extensions.geography)
    order by sig.starts_at,sig.id limit 100
  ) q;
  return result;
end; $$;

create function app_private.broadcast_signal() returns trigger language plpgsql security definer set search_path='' as $$
declare sid uuid; cell text;
begin
  if tg_table_name='signals' then sid:=new.id; else sid:=new.signal_id; end if;
  select p.h3_parent into cell from app_private.signals s join public.places p on p.id=s.place_id where s.id=sid;
  -- Invalidation only; receivers always re-fetch the authoritative projection.
  perform realtime.send(jsonb_build_object('id',sid),'invalidate','signals:hcm:'||cell,false);
  return new;
end; $$;
create trigger signal_broadcast after insert or update on app_private.signals for each row execute function app_private.broadcast_signal();
create trigger action_broadcast after insert or update on app_private.actions for each row execute function app_private.broadcast_signal();

create function public.publish_signal(p_input jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); existing uuid; place public.places; result uuid;
begin
  if actor is null then raise exception using errcode='VS001',message='authentication required'; end if;
  if not exists(select 1 from app_private.profiles where id=actor and role in ('host','moderator')) then raise exception using errcode='VS002',message='host required'; end if;
  -- Serialize per actor for retry idempotency and race-safe rate limits.
  perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
  select id into existing from app_private.signals where author_id=actor and request_id=(p_input->>'request_id')::uuid;
  if existing is not null then return existing; end if;
  if exists(select 1 from jsonb_object_keys(p_input) k where k not in ('request_id','place_id','title','description','category','starts_at','expires_at','capacity_note')) then
    raise exception using errcode='VS005',message='unknown fields';
  end if;
  select * into place from public.places where id=(p_input->>'place_id')::uuid and enabled;
  if place.id is null or not exists(select 1 from public.cities c where c.id=place.city_id and extensions.st_covers(c.pilot_bounds,place.location::extensions.geometry)) then
    raise exception using errcode='VS005',message='venue outside pilot';
  end if;
  -- Hosts can schedule up to seven days ahead; discovery still exposes only the next six hours.
  if (p_input->>'expires_at')::timestamptz<=now() or (p_input->>'starts_at')::timestamptz>now()+interval '7 days' then
    raise exception using errcode='VS005',message='invalid time';
  end if;
  -- Pilot limit: 10 new activities per host per rolling day.
  if (select count(*) from app_private.signals where author_id=actor and created_at>now()-interval '1 day')>=10 then
    raise exception using errcode='VS006',message='publish rate limit';
  end if;
  insert into app_private.signals(author_id,request_id,place_id,title,description,category,starts_at,expires_at,capacity_note)
  values(actor,(p_input->>'request_id')::uuid,place.id,trim(p_input->>'title'),coalesce(p_input->>'description',''),p_input->>'category',
    (p_input->>'starts_at')::timestamptz,(p_input->>'expires_at')::timestamptz,coalesce(p_input->>'capacity_note','')) returning id into result;
  insert into app_private.audit_events(signal_id,actor_id,reason_code) values(result,actor,'published');
  return result;
exception when check_violation or not_null_violation or invalid_text_representation or datetime_field_overflow then
  raise exception using errcode='VS005',message='invalid activity';
end; $$;

create function public.act_on_signal(p_id uuid,p_action text,p_reason text default '') returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); sig app_private.signals; bucket text; old_value text;
begin
  if actor is null then raise exception using errcode='VS001',message='authentication required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
  select * into sig from app_private.signals where id=p_id for update;
  if sig.id is null or sig.status<>'active' or sig.expires_at<=now() then
    raise exception using errcode='VS003',message='activity unavailable';
  end if;
  if p_action not in ('resolve','remove') and (sig.starts_at>now()+interval '6 hours' or not exists(select 1 from public.places where id=sig.place_id and enabled)) then
    raise exception using errcode='VS003',message='activity unavailable';
  end if;
  if p_action='resolve' or p_action='remove' then
    if (p_action='resolve' and sig.author_id<>actor) or (p_action='remove' and not exists(select 1 from app_private.profiles where id=actor and role='moderator')) then
      raise exception using errcode='VS002',message='forbidden';
    end if;
    update app_private.signals set status=case when p_action='resolve' then 'resolved' else 'removed' end where id=p_id;
  else
    if p_action not in ('join','go','confirm','not_there','report') or p_action is null or length(p_reason)>300 then raise exception using errcode='VS005',message='invalid action'; end if;
    if actor=sig.author_id and p_action in ('confirm','not_there') then raise exception using errcode='VS004',message='self verification forbidden'; end if;
    bucket:=case when p_action in ('join','go') then 'attendance' when p_action in ('confirm','not_there') then 'verification' else 'report' end;
    select value into old_value from app_private.actions where signal_id=p_id and user_id=actor and kind=bucket;
    if old_value=p_action then return; end if;
    -- Limit actual mutations, including vote flips, rather than just row count.
    if (select count(*) from app_private.audit_events where actor_id=actor and created_at>now()-interval '1 minute')>=30 then
      raise exception using errcode='VS006',message='action rate limit';
    end if;
    insert into app_private.actions(signal_id,user_id,kind,value,reason) values(p_id,actor,bucket,p_action,coalesce(p_reason,''))
      on conflict(signal_id,user_id,kind) do update set value=excluded.value,reason=excluded.reason,updated_at=now();
  end if;
  insert into app_private.audit_events(signal_id,actor_id,reason_code) values(p_id,actor,p_action);
end; $$;

create function public.moderation_queue() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not exists(select 1 from app_private.profiles where id=auth.uid() and role='moderator') then raise exception using errcode='VS002',message='moderator required'; end if;
  return coalesce((select jsonb_agg(q) from (select s.id,s.title,count(a.*) as report_count from app_private.signals s
    join app_private.actions a on a.signal_id=s.id and a.kind='report' where s.status='active' and s.expires_at>now()
    group by s.id order by count(a.*) desc limit 100) q),'[]'::jsonb);
end; $$;

revoke all on all functions in schema app_private from public,anon,authenticated;
revoke all on function public.viewer_profile(),public.get_signal(uuid),public.discover_signals(jsonb),public.publish_signal(jsonb),public.act_on_signal(uuid,text,text),public.moderation_queue() from public,anon,authenticated;
grant execute on function public.get_signal(uuid),public.discover_signals(jsonb) to anon,authenticated;
grant execute on function public.viewer_profile(),public.publish_signal(jsonb),public.act_on_signal(uuid,text,text),public.moderation_queue() to authenticated;
-- Future functions must opt into public execution explicitly.
alter default privileges in schema app_private revoke execute on functions from public;

create function public.my_signal_state(p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'is_owner',s.author_id=auth.uid(),
    'attendance',(select value from app_private.actions where signal_id=s.id and user_id=auth.uid() and kind='attendance'),
    'verification',(select value from app_private.actions where signal_id=s.id and user_id=auth.uid() and kind='verification'),
    'reported',exists(select 1 from app_private.actions where signal_id=s.id and user_id=auth.uid() and kind='report')
  ) from app_private.signals s where s.id=p_id and auth.uid() is not null and app_private.project_signal(p_id) is not null;
$$;
revoke all on function public.my_signal_state(uuid) from public,anon,authenticated;
grant execute on function public.my_signal_state(uuid) to authenticated;
