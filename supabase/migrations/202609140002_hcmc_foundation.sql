-- Vietnam Social: Task 002 — Ho Chi Minh City Production Foundation
-- Extends the geographic model from the 3-district pilot to first-class city support.

-- 1. Extend cities table with canonical metadata and operational boundary
alter table public.cities
  add column if not exists slug text,
  add column if not exists country_code text not null default 'VN',
  add column if not exists timezone text not null default 'Asia/Ho_Chi_Minh',
  add column if not exists default_longitude double precision not null default 106.675,
  add column if not exists default_latitude double precision not null default 10.815,
  add column if not exists default_zoom integer not null default 13,
  add column if not exists active boolean not null default true,
  add column if not exists launch_state text not null default 'live' check (launch_state in ('pilot','live','inactive')),
  add column if not exists operational_boundary extensions.geometry(Polygon,4326);

-- 2. Update canonical Ho Chi Minh City record with operational boundary
-- Note: operational_boundary is a simplified operational envelope covering HCMC (urban core, suburban districts, and Can Gio)
-- for validation and viewport bounding, not an administrative/legal boundary delimitation.
update public.cities
set
  slug = 'ho-chi-minh',
  name = 'TP. Hồ Chí Minh',
  country_code = 'VN',
  timezone = 'Asia/Ho_Chi_Minh',
  default_longitude = 106.675,
  default_latitude = 10.815,
  default_zoom = 13,
  active = true,
  launch_state = 'live',
  operational_boundary = extensions.st_makeenvelope(106.35, 10.35, 107.05, 11.20, 4326),
  pilot_bounds = extensions.st_makeenvelope(106.35, 10.35, 107.05, 11.20, 4326)
where id = 'hcm';

-- 3. Ensure slug uniqueness for multi-city lookups
create unique index if not exists cities_slug_idx on public.cities(slug) where slug is not null;
create index if not exists places_city_enabled_idx on public.places(city_id, enabled);

-- 4. Update publish_signal to validate against active city operational boundary
create or replace function public.publish_signal(p_input jsonb) returns uuid language plpgsql security definer set search_path='' as $$
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
  if place.id is null or not exists(
    select 1 from public.cities c
    where c.id=place.city_id
      and c.active
      and extensions.st_covers(coalesce(c.operational_boundary, c.pilot_bounds), place.location::extensions.geometry)
  ) then
    raise exception using errcode='VS005',message='venue outside city boundary';
  end if;
  -- Hosts can schedule up to seven days ahead; discovery still exposes only the next six hours.
  if (p_input->>'expires_at')::timestamptz<=now() or (p_input->>'starts_at')::timestamptz>now()+interval '7 days' then
    raise exception using errcode='VS005',message='invalid time';
  end if;
  -- Rolling limit: 10 new activities per host per rolling day.
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

-- 5. Update discover_signals to support optional city scoping while enforcing bounded viewports
create or replace function public.discover_signals(p_bounds jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare w double precision; e double precision; n double precision; s double precision; target_city text; result jsonb;
begin
  w:=(p_bounds->>'west')::double precision; e:=(p_bounds->>'east')::double precision;
  n:=(p_bounds->>'north')::double precision; s:=(p_bounds->>'south')::double precision;
  target_city:=p_bounds->>'city_id';
  if w is null or e is null or n is null or s is null or not(w>=-180 and e<=180 and s>=-90 and n<=90 and e>w and n>s and e-w<=0.25 and n-s<=0.25) then
    raise exception using errcode='VS005',message='invalid bounds';
  end if;
  select coalesce(jsonb_agg(q.item order by q.starts_at,q.id),'[]'::jsonb) into result from (
    select app_private.project_signal(sig.id) item,sig.starts_at,sig.id
    from app_private.signals sig join public.places p on p.id=sig.place_id
    where sig.status='active' and sig.expires_at>now() and sig.starts_at<=now()+interval '6 hours' and p.enabled
      and (target_city is null or p.city_id=target_city)
      and extensions.st_intersects(p.location,extensions.st_makeenvelope(w,s,e,n,4326)::extensions.geography)
    order by sig.starts_at,sig.id limit 100
  ) q;
  return result;
end; $$;

revoke all on function public.publish_signal(jsonb) from public,anon,authenticated;
grant execute on function public.publish_signal(jsonb) to authenticated;
revoke all on function public.discover_signals(jsonb) from public,anon,authenticated;
grant execute on function public.discover_signals(jsonb) to anon,authenticated;
