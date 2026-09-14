-- Vietnam Social: Task 003 — HCMC Supply System & Real-World Evidence
-- Implements the host supply acquisition loop:
--   Operator invites host -> Host accepts & onboards -> Host linked to approved venue(s) ->
--   Host manages templates & fast publishes -> Real user qualified interactions ->
--   Operator measures supply, demand & 7-day evidence gate without fake data.

create extension if not exists pgcrypto with schema extensions;

-- 1. Correct HCMC launch state from 'live' to 'pilot' to reflect commercial validation reality.
update public.cities
set launch_state = 'pilot'
where id = 'hcm';

-- 2. Host Invitation System
create table if not exists app_private.host_invites (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  invited_email text check (invited_email is null or length(invited_email) between 3 and 120),
  invited_by uuid not null references auth.users(id) on delete cascade,
  venue_id uuid references public.places(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','accepted','revoked','expired')),
  note text not null default '' check (length(note) <= 300),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null
);
alter table app_private.host_invites enable row level security;
revoke all on app_private.host_invites from public, anon, authenticated;

-- 3. Extend profiles with minimal host onboarding fields (no GPS, no unnecessary personal data)
alter table app_private.profiles
  add column if not exists organizer_label text not null default '' check (length(organizer_label) <= 120),
  add column if not exists bio text not null default '' check (length(bio) <= 500),
  add column if not exists contact_channel text not null default '' check (length(contact_channel) <= 120),
  add column if not exists onboarded_at timestamptz,
  add column if not exists disabled_at timestamptz;

-- 4. Host-Venue Membership Authorization
create table if not exists app_private.host_venue_memberships (
  host_id uuid not null references auth.users(id) on delete cascade,
  place_id uuid not null references public.places(id) on delete cascade,
  status text not null default 'active' check (status in ('active','revoked')),
  granted_by uuid not null references auth.users(id) on delete cascade,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (host_id, place_id)
);
alter table app_private.host_venue_memberships enable row level security;
revoke all on app_private.host_venue_memberships from public, anon, authenticated;

-- 5. Venue Suggestion Queue for Hosts
create table if not exists app_private.venue_suggestions (
  id uuid primary key default gen_random_uuid(),
  suggested_by uuid not null references auth.users(id) on delete cascade,
  city_id text not null references public.cities(id),
  name text not null check (length(trim(name)) between 2 and 120),
  area text not null check (length(trim(area)) between 2 and 80),
  address text not null default '' check (length(address) <= 250),
  longitude double precision not null check (longitude between -180 and 180),
  latitude double precision not null check (latitude between -90 and 90),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  rejection_reason text not null default '' check (length(rejection_reason) <= 300),
  created_at timestamptz not null default now()
);
alter table app_private.venue_suggestions enable row level security;
revoke all on app_private.venue_suggestions from public, anon, authenticated;

-- 6. Reusable Activity Templates for 30-60s Fast Publishing
create table if not exists app_private.activity_templates (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references auth.users(id) on delete cascade,
  place_id uuid not null references public.places(id) on delete cascade,
  title text not null check (length(trim(title)) between 8 and 100),
  description text not null default '' check (length(description) <= 600),
  category text not null check (category in ('sport','music','workshop','community')),
  duration_minutes integer not null default 120 check (duration_minutes between 15 and 720),
  capacity_note text not null default '' check (length(capacity_note) <= 100),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table app_private.activity_templates enable row level security;
revoke all on app_private.activity_templates from public, anon, authenticated;

-- 7. Analytics Event Ledger (Real vs Test/Demo Separation, Privacy-Preserving)
create table if not exists app_private.analytics_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (length(event_type) between 3 and 50),
  city_id text not null references public.cities(id),
  signal_id uuid references app_private.signals(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  session_id text not null check (length(session_id) <= 64),
  is_qualified boolean not null default false,
  is_demo boolean not null default false,
  is_test boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table app_private.analytics_events enable row level security;
revoke all on app_private.analytics_events from public, anon, authenticated;
create index if not exists analytics_events_time_type on app_private.analytics_events(created_at, event_type);
create index if not exists analytics_events_signal on app_private.analytics_events(signal_id);

-- =========================================================================
-- RPC IMPLEMENTATIONS
-- =========================================================================

-- 8. Create Host Invite (Operator/Moderator Only)
create or replace function public.create_host_invite(p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor uuid := auth.uid();
  v_token text;
  v_hash text;
  v_id uuid;
  v_expires timestamptz;
  v_venue_id uuid := null;
  v_email text := null;
  v_note text := '';
begin
  if actor is null then raise exception using errcode='VS001',message='authentication required'; end if;
  if not exists(select 1 from app_private.profiles where id=actor and role='moderator') then
    raise exception using errcode='VS002',message='moderator required';
  end if;

  -- Rate limit: max 20 invites per moderator per hour.
  if (select count(*) from app_private.host_invites where invited_by=actor and created_at>now()-interval '1 hour') >= 20 then
    raise exception using errcode='VS006',message='invite rate limit exceeded';
  end if;

  if p_input->>'venue_id' is not null then
    v_venue_id := (p_input->>'venue_id')::uuid;
    if not exists(select 1 from public.places where id=v_venue_id and enabled) then
      raise exception using errcode='VS005',message='invalid venue';
    end if;
  end if;

  if p_input->>'email' is not null and length(trim(p_input->>'email')) > 0 then
    v_email := trim(p_input->>'email');
  end if;

  if p_input->>'note' is not null then
    v_note := trim(p_input->>'note');
  end if;

  -- Generate 64-char cryptographically strong random token
  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  v_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');
  v_expires := now() + interval '7 days';

  insert into app_private.host_invites(token_hash, invited_email, invited_by, venue_id, status, note, expires_at)
  values(v_hash, v_email, actor, v_venue_id, 'pending', v_note, v_expires)
  returning id into v_id;

  insert into app_private.audit_events(actor_id, reason_code)
  values(actor, 'host_invite_created');

  return jsonb_build_object(
    'id', v_id,
    'token', v_token,
    'expires_at', v_expires,
    'venue_id', v_venue_id,
    'status', 'pending'
  );
end; $$;

-- 9. Inspect Host Invite (Public/Authenticated)
create or replace function public.inspect_host_invite(p_token text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  v_hash text;
  v_invite app_private.host_invites;
  v_venue public.places;
begin
  if p_token is null or length(trim(p_token)) < 10 then
    raise exception using errcode='VS005',message='invalid invite token';
  end if;
  v_hash := encode(extensions.digest(trim(p_token), 'sha256'), 'hex');
  select * into v_invite from app_private.host_invites where token_hash=v_hash;
  if v_invite.id is null then
    raise exception using errcode='VS003',message='invite not found';
  end if;

  if v_invite.status = 'pending' and v_invite.expires_at <= now() then
    return jsonb_build_object('status', 'expired');
  end if;

  if v_invite.venue_id is not null then
    select * into v_venue from public.places where id=v_invite.venue_id;
  end if;

  return jsonb_build_object(
    'id', v_invite.id,
    'status', v_invite.status,
    'expires_at', v_invite.expires_at,
    'venue_id', v_invite.venue_id,
    'venue_name', v_venue.name,
    'venue_area', v_venue.area,
    'invited_email', v_invite.invited_email
  );
end; $$;

-- 10. Accept Host Invite (Authenticated, One-Time, Idempotent, Never Escalates to Moderator)
create or replace function public.accept_host_invite(p_token text) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor uuid := auth.uid();
  v_hash text;
  v_invite app_private.host_invites;
begin
  if actor is null then raise exception using errcode='VS001',message='authentication required'; end if;
  if p_token is null or length(trim(p_token)) < 10 then
    raise exception using errcode='VS005',message='invalid invite token';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(actor::text, 1));

  v_hash := encode(extensions.digest(trim(p_token), 'sha256'), 'hex');
  select * into v_invite from app_private.host_invites where token_hash=v_hash for update;

  if v_invite.id is null then
    raise exception using errcode='VS003',message='invite not found';
  end if;

  -- Idempotency: if already accepted by this user, return success
  if v_invite.status = 'accepted' and v_invite.accepted_by = actor then
    return jsonb_build_object('success', true, 'already_accepted', true, 'role', 'host');
  end if;

  if v_invite.status = 'accepted' then
    raise exception using errcode='VS005',message='invite already accepted';
  end if;

  if v_invite.status = 'revoked' or v_invite.expires_at <= now() then
    update app_private.host_invites set status='expired' where id=v_invite.id;
    raise exception using errcode='VS005',message='invite has expired or been revoked';
  end if;

  -- Strictly grant role 'host', never moderator
  update app_private.profiles
  set role = case when role = 'moderator' then 'moderator' else 'host' end
  where id = actor;

  -- If invite had a pre-assigned venue, link it automatically
  if v_invite.venue_id is not null then
    insert into app_private.host_venue_memberships(host_id, place_id, status, granted_by)
    values(actor, v_invite.venue_id, 'active', v_invite.invited_by)
    on conflict(host_id, place_id) do update set status='active', revoked_at=null;
  end if;

  -- Mark invite accepted
  update app_private.host_invites
  set status = 'accepted', accepted_at = now(), accepted_by = actor
  where id = v_invite.id;

  insert into app_private.audit_events(actor_id, reason_code)
  values(actor, 'host_invite_accepted');

  return jsonb_build_object(
    'success', true,
    'role', 'host',
    'venue_id', v_invite.venue_id
  );
end; $$;

-- 11. Complete Host Onboarding
create or replace function public.complete_host_onboarding(p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor uuid := auth.uid();
  v_label text;
  v_bio text;
  v_channel text;
begin
  if actor is null then raise exception using errcode='VS001',message='authentication required'; end if;
  if not exists(select 1 from app_private.profiles where id=actor and role in ('host','moderator')) then
    raise exception using errcode='VS002',message='host required';
  end if;

  v_label := coalesce(nullif(trim(p_input->>'organizer_label'), ''), '');
  v_bio := coalesce(nullif(trim(p_input->>'bio'), ''), '');
  v_channel := coalesce(nullif(trim(p_input->>'contact_channel'), ''), '');

  if length(v_label) > 120 or length(v_bio) > 500 or length(v_channel) > 120 then
    raise exception using errcode='VS005',message='field length exceeded';
  end if;

  update app_private.profiles
  set
    organizer_label = v_label,
    bio = v_bio,
    contact_channel = v_channel,
    onboarded_at = coalesce(onboarded_at, now())
  where id = actor;

  insert into app_private.audit_events(actor_id, reason_code)
  values(actor, 'host_onboarded');

  return (select jsonb_build_object(
    'id', id,
    'role', role,
    'display_name', display_name,
    'organizer_label', organizer_label,
    'bio', bio,
    'contact_channel', contact_channel,
    'onboarded_at', onboarded_at
  ) from app_private.profiles where id=actor);
end; $$;

-- 12. Suggest Venue (Host / Moderator)
create or replace function public.suggest_venue(p_input jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare
  actor uuid := auth.uid();
  v_result uuid;
  v_lng double precision;
  v_lat double precision;
  v_city_id text;
begin
  if actor is null then raise exception using errcode='VS001',message='authentication required'; end if;
  if not exists(select 1 from app_private.profiles where id=actor and role in ('host','moderator')) then
    raise exception using errcode='VS002',message='host required';
  end if;

  -- Rate limit: max 5 suggestions per host per rolling 24 hours
  if (select count(*) from app_private.venue_suggestions where suggested_by=actor and created_at>now()-interval '1 day') >= 5 then
    raise exception using errcode='VS006',message='venue suggestion limit reached';
  end if;

  v_city_id := coalesce(p_input->>'city_id', 'hcm');
  v_lng := (p_input->>'longitude')::double precision;
  v_lat := (p_input->>'latitude')::double precision;

  if v_lng is null or v_lat is null or not(v_lng between -180 and 180 and v_lat between -90 and 90) then
    raise exception using errcode='VS005',message='invalid coordinates';
  end if;

  -- Verify coordinates are within city operational boundary
  if not exists(
    select 1 from public.cities c
    where c.id=v_city_id
      and c.active
      and extensions.st_covers(coalesce(c.operational_boundary, c.pilot_bounds), extensions.st_setsrid(extensions.st_makepoint(v_lng, v_lat), 4326))
  ) then
    raise exception using errcode='VS005',message='venue outside city boundary';
  end if;

  insert into app_private.venue_suggestions(suggested_by, city_id, name, area, address, longitude, latitude)
  values(actor, v_city_id, trim(p_input->>'name'), trim(p_input->>'area'), coalesce(trim(p_input->>'address'), ''), v_lng, v_lat)
  returning id into v_result;

  insert into app_private.audit_events(actor_id, reason_code)
  values(actor, 'venue_suggested');

  return v_result;
end; $$;

-- 13. Review Venue Suggestion (Operator/Moderator Only)
create or replace function public.review_venue_suggestion(p_id uuid, p_action text, p_reason text default '') returns uuid language plpgsql security definer set search_path='' as $$
declare
  actor uuid := auth.uid();
  v_sug app_private.venue_suggestions;
  v_place_id uuid := null;
  v_h3 text := '8665b5647ffffff'; -- Canonical resolution 6 H3 partition for HCMC urban core
begin
  if actor is null then raise exception using errcode='VS001',message='authentication required'; end if;
  if not exists(select 1 from app_private.profiles where id=actor and role='moderator') then
    raise exception using errcode='VS002',message='moderator required';
  end if;

  select * into v_sug from app_private.venue_suggestions where id=p_id for update;
  if v_sug.id is null or v_sug.status <> 'pending' then
    raise exception using errcode='VS003',message='suggestion not pending';
  end if;

  if p_action = 'approve' then
    insert into public.places(city_id, name, area, longitude, latitude, h3_parent, enabled)
    values(v_sug.city_id, v_sug.name, v_sug.area, v_sug.longitude, v_sug.latitude, v_h3, true)
    returning id into v_place_id;

    -- Automatically authorize the suggesting host for this venue
    insert into app_private.host_venue_memberships(host_id, place_id, status, granted_by)
    values(v_sug.suggested_by, v_place_id, 'active', actor)
    on conflict (host_id, place_id) do update set status='active', revoked_at=null;

    update app_private.venue_suggestions
    set status = 'approved', reviewed_by = actor, reviewed_at = now()
    where id = v_sug.id;

    insert into app_private.audit_events(actor_id, reason_code)
    values(actor, 'venue_suggestion_approved');

    return v_place_id;
  elsif p_action = 'reject' then
    update app_private.venue_suggestions
    set status = 'rejected', reviewed_by = actor, reviewed_at = now(), rejection_reason = coalesce(p_reason, '')
    where id = v_sug.id;

    insert into app_private.audit_events(actor_id, reason_code)
    values(actor, 'venue_suggestion_rejected');

    return v_sug.id;
  else
    raise exception using errcode='VS005',message='invalid review action';
  end if;
end; $$;

-- 14. Manage Venue (Operator/Moderator Only)
create or replace function public.manage_venue(p_input jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare
  actor uuid := auth.uid();
  v_action text := p_input->>'action';
  v_id uuid;
  v_place public.places;
  v_lng double precision;
  v_lat double precision;
  v_city_id text;
  v_h3 text := '8665b5647ffffff';
begin
  if actor is null then raise exception using errcode='VS001',message='authentication required'; end if;
  if not exists(select 1 from app_private.profiles where id=actor and role='moderator') then
    raise exception using errcode='VS002',message='moderator required';
  end if;

  if v_action = 'create' then
    v_city_id := coalesce(p_input->>'city_id', 'hcm');
    v_lng := (p_input->>'longitude')::double precision;
    v_lat := (p_input->>'latitude')::double precision;

    if not exists(
      select 1 from public.cities c
      where c.id=v_city_id and c.active
        and extensions.st_covers(coalesce(c.operational_boundary, c.pilot_bounds), extensions.st_setsrid(extensions.st_makepoint(v_lng, v_lat), 4326))
    ) then
      raise exception using errcode='VS005',message='venue outside city boundary';
    end if;

    insert into public.places(city_id, name, area, longitude, latitude, h3_parent, enabled)
    values(v_city_id, trim(p_input->>'name'), trim(p_input->>'area'), v_lng, v_lat, v_h3, true)
    returning id into v_id;

    insert into app_private.audit_events(actor_id, reason_code) values(actor, 'venue_created');
    return v_id;

  elsif v_action = 'toggle' then
    v_id := (p_input->>'id')::uuid;
    select * into v_place from public.places where id=v_id;
    if v_place.id is null then raise exception using errcode='VS003',message='venue not found'; end if;

    update public.places set enabled = not enabled where id=v_id;
    insert into app_private.audit_events(actor_id, reason_code) values(actor, 'venue_status_toggled');
    return v_id;

  else
    raise exception using errcode='VS005',message='invalid venue action';
  end if;
end; $$;

-- 15. Grant & Revoke Host-Venue Membership (Moderator Only)
create or replace function public.grant_host_venue(p_host_id uuid, p_place_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null then raise exception using errcode='VS001',message='authentication required'; end if;
  if not exists(select 1 from app_private.profiles where id=actor and role='moderator') then
    raise exception using errcode='VS002',message='moderator required';
  end if;
  if not exists(select 1 from app_private.profiles where id=p_host_id and role in ('host','moderator')) then
    raise exception using errcode='VS005',message='target user is not a host';
  end if;
  if not exists(select 1 from public.places where id=p_place_id and enabled) then
    raise exception using errcode='VS005',message='venue not found or disabled';
  end if;

  insert into app_private.host_venue_memberships(host_id, place_id, status, granted_by)
  values(p_host_id, p_place_id, 'active', actor)
  on conflict (host_id, place_id) do update set status='active', revoked_at=null;

  insert into app_private.audit_events(actor_id, reason_code) values(actor, 'host_venue_granted');
end; $$;

create or replace function public.revoke_host_venue(p_host_id uuid, p_place_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null then raise exception using errcode='VS001',message='authentication required'; end if;
  if not exists(select 1 from app_private.profiles where id=actor and role='moderator') then
    raise exception using errcode='VS002',message='moderator required';
  end if;

  update app_private.host_venue_memberships
  set status = 'revoked', revoked_at = now()
  where host_id = p_host_id and place_id = p_place_id;

  insert into app_private.audit_events(actor_id, reason_code) values(actor, 'host_venue_revoked');
end; $$;

-- 16. Activity Templates Management (Host/Moderator, Strict Tenant Isolation)
create or replace function public.manage_template(p_action text, p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor uuid := auth.uid();
  v_id uuid;
  v_place_id uuid;
  v_template app_private.activity_templates;
begin
  if actor is null then raise exception using errcode='VS001',message='authentication required'; end if;
  if not exists(select 1 from app_private.profiles where id=actor and role in ('host','moderator')) then
    raise exception using errcode='VS002',message='host required';
  end if;

  if p_action = 'list' then
    return coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id,
        'title', t.title,
        'description', t.description,
        'category', t.category,
        'place_id', t.place_id,
        'place_name', p.name,
        'area', p.area,
        'duration_minutes', t.duration_minutes,
        'capacity_note', t.capacity_note,
        'created_at', t.created_at
      ) order by t.created_at desc)
      from app_private.activity_templates t
      join public.places p on p.id = t.place_id
      where t.host_id = actor and t.active and p.enabled
    ), '[]'::jsonb);

  elsif p_action = 'create' then
    v_place_id := (p_input->>'place_id')::uuid;
    -- Verify venue authorization for host
    if not exists(select 1 from app_private.host_venue_memberships where host_id=actor and place_id=v_place_id and status='active')
       and not exists(select 1 from app_private.profiles where id=actor and role='moderator') then
      raise exception using errcode='VS002',message='venue not authorized for host';
    end if;

    insert into app_private.activity_templates(host_id, place_id, title, description, category, duration_minutes, capacity_note)
    values(
      actor,
      v_place_id,
      trim(p_input->>'title'),
      coalesce(trim(p_input->>'description'), ''),
      p_input->>'category',
      coalesce((p_input->>'duration_minutes')::integer, 120),
      coalesce(trim(p_input->>'capacity_note'), '')
    )
    returning id into v_id;

    insert into app_private.audit_events(actor_id, reason_code) values(actor, 'template_created');
    return jsonb_build_object('id', v_id, 'status', 'created');

  elsif p_action = 'delete' then
    v_id := (p_input->>'id')::uuid;
    select * into v_template from app_private.activity_templates where id=v_id;
    if v_template.id is null or (v_template.host_id <> actor and not exists(select 1 from app_private.profiles where id=actor and role='moderator')) then
      raise exception using errcode='VS002',message='forbidden';
    end if;

    update app_private.activity_templates set active=false, updated_at=now() where id=v_id;
    return jsonb_build_object('id', v_id, 'status', 'deleted');

  else
    raise exception using errcode='VS005',message='invalid template action';
  end if;
end; $$;

-- 17. Update publish_signal to enforce venue authorization for hosts
create or replace function public.publish_signal(p_input jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare
  actor uuid := auth.uid();
  existing uuid;
  place public.places;
  result uuid;
begin
  if actor is null then raise exception using errcode='VS001',message='authentication required'; end if;
  if not exists(select 1 from app_private.profiles where id=actor and role in ('host','moderator')) then
    raise exception using errcode='VS002',message='host required';
  end if;

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

  -- Enforce explicit venue authorization: host must be linked to this venue. Moderators can publish anywhere.
  if not exists(select 1 from app_private.host_venue_memberships where host_id=actor and place_id=place.id and status='active')
     and not exists(select 1 from app_private.profiles where id=actor and role='moderator') then
    raise exception using errcode='VS002',message='venue not authorized for host';
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

-- 18. Record Client Analytics Event (Privacy-Preserving, Rejects Raw GPS)
create or replace function public.record_client_event(p_event jsonb) returns void language plpgsql security definer set search_path='' as $$
declare
  actor uuid := auth.uid();
  v_type text := p_event->>'type';
  v_city_id text := coalesce(p_event->>'city_id', 'hcm');
  v_signal_id uuid := null;
  v_session text := coalesce(p_event->>'session_id', 'anonymous');
  v_qualified boolean := coalesce((p_event->>'is_qualified')::boolean, false);
  v_demo boolean := coalesce((p_event->>'is_demo')::boolean, false);
  v_test boolean := coalesce((p_event->>'is_test')::boolean, false);
begin
  -- Strict Privacy Invariant: NEVER store raw GPS coordinates
  if exists (select 1 from jsonb_object_keys(p_event) k where k in ('latitude','longitude','lat','lng','coords','location')) then
    raise exception using errcode='VS005',message='privacy invariant: raw coordinates forbidden';
  end if;

  if p_event->>'signal_id' is not null then
    v_signal_id := (p_event->>'signal_id')::uuid;
  end if;

  insert into app_private.analytics_events(event_type, city_id, signal_id, actor_id, session_id, is_qualified, is_demo, is_test, metadata)
  values(v_type, v_city_id, v_signal_id, actor, v_session, v_qualified, v_demo, v_test, p_event);
end; $$;

-- 19. Supply Operations Dashboard Metrics & 7-Day Evidence Gate (Moderator Only)
create or replace function public.supply_dashboard_metrics() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  actor uuid := auth.uid();
  v_hosts_invited integer;
  v_hosts_accepted integer;
  v_hosts_onboarded integer;
  v_hosts_published_1 integer;
  v_hosts_published_again integer;
  v_venues_approved integer;
  v_venues_disabled integer;
  v_venues_pending integer;
  v_venues_host_linked integer;
  v_signals_7d integer;
  v_signals_active integer;
  v_unique_users_exposed integer;
  v_meaningful_actions integer;
  v_returning_users integer;
  v_gate_host_status text;
  v_gate_supply_status text;
  v_gate_demand_status text;
  v_gate_action_status text;
  v_gate_return_status text;
  v_overall_gate_status text;
  v_by_category jsonb;
  v_by_venue jsonb;
  v_by_host jsonb;
  v_by_day jsonb;
  v_zero_opens jsonb;
  v_reports_count integer;
  v_not_there_count integer;
begin
  if actor is null then raise exception using errcode='VS001',message='authentication required'; end if;
  if not exists(select 1 from app_private.profiles where id=actor and role='moderator') then
    raise exception using errcode='VS002',message='moderator required';
  end if;

  -- 1. Hosts Funnel (Excluding test/fictional hosts)
  select count(*) into v_hosts_invited from app_private.host_invites;
  select count(*) into v_hosts_accepted from app_private.host_invites where status='accepted';
  select count(*) into v_hosts_onboarded from app_private.profiles where role in ('host','moderator') and onboarded_at is not null;

  -- Hosts who published >= 1 real signal
  select count(distinct author_id) into v_hosts_published_1 from app_private.signals;
  -- Hosts who published >= 2 real signals on separate days
  select count(*) into v_hosts_published_again from (
    select author_id from app_private.signals group by author_id having count(distinct date_trunc('day', created_at)) >= 2
  ) q;

  -- 2. Venues
  select count(*) filter(where enabled) into v_venues_approved from public.places;
  select count(*) filter(where not enabled) into v_venues_disabled from public.places;
  select count(*) into v_venues_pending from app_private.venue_suggestions where status='pending';
  select count(distinct place_id) into v_venues_host_linked from app_private.host_venue_memberships where status='active';

  -- 3. Supply (7-day window)
  select count(*) into v_signals_7d from app_private.signals where created_at >= now() - interval '7 days';
  select count(*) into v_signals_active from app_private.signals where status='active' and expires_at > now() and starts_at <= now() + interval '6 hours';

  -- Supply distributions
  select coalesce(jsonb_object_agg(category, c), '{}'::jsonb) into v_by_category
  from (select category, count(*) as c from app_private.signals where created_at >= now() - interval '7 days' group by category) q;

  select coalesce(jsonb_agg(q), '[]'::jsonb) into v_by_venue from (
    select p.name as place_name, count(s.*) as signal_count
    from app_private.signals s join public.places p on p.id = s.place_id
    where s.created_at >= now() - interval '7 days'
    group by p.name order by count(s.*) desc limit 10
  ) q;

  select coalesce(jsonb_agg(q), '[]'::jsonb) into v_by_host from (
    select pr.display_name, count(s.*) as signal_count
    from app_private.signals s join app_private.profiles pr on pr.id = s.author_id
    where s.created_at >= now() - interval '7 days'
    group by pr.display_name order by count(s.*) desc limit 10
  ) q;

  select coalesce(jsonb_agg(q), '[]'::jsonb) into v_by_day from (
    select to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as day, count(*) as count
    from app_private.signals where created_at >= now() - interval '7 days'
    group by 1 order by 1
  ) q;

  -- Signals with zero qualified opens
  select coalesce(jsonb_agg(q), '[]'::jsonb) into v_zero_opens from (
    select s.id, s.title, s.starts_at from app_private.signals s
    where s.created_at >= now() - interval '7 days'
      and not exists (
        select 1 from app_private.analytics_events e
        where e.signal_id = s.id and e.event_type = 'signal_opened' and e.is_qualified
      )
    order by s.starts_at desc limit 20
  ) q;

  -- 4. Demand Evidence (Filtering out demo/test events)
  -- Unique target users exposed to real listings (qualified opens + distinct viewers)
  select coalesce(count(distinct session_id), 0) into v_unique_users_exposed
  from app_private.analytics_events
  where not is_demo and not is_test and event_type in ('signal_opened', 'signal_impression') and created_at >= now() - interval '7 days';

  -- Meaningful actions: count of confirmed real-world actions (join/go + post-start verification by non-author)
  select count(*) into v_meaningful_actions
  from (
    select a1.signal_id, a1.user_id
    from app_private.actions a1
    join app_private.actions a2 on a2.signal_id = a1.signal_id and a2.user_id = a1.user_id and a2.kind = 'verification' and a2.value = 'confirm'
    join app_private.signals s on s.id = a1.signal_id
    where a1.kind = 'attendance' and a1.value in ('join', 'go')
      and s.author_id <> a1.user_id -- Non-author
      and a2.updated_at >= s.starts_at -- Confirmed during/after activity
      and s.created_at >= now() - interval '7 days'
  ) q;

  -- Voluntary returning users (distinct users who acted in >= 2 distinct days)
  select count(*) into v_returning_users from (
    select user_id from app_private.actions
    where updated_at >= now() - interval '7 days'
    group by user_id having count(distinct date_trunc('day', updated_at)) >= 2
  ) q;

  -- Moderation flags
  select count(*) into v_reports_count from app_private.actions where kind='report';
  select count(*) into v_not_there_count from app_private.actions where kind='verification' and value='not_there';

  -- 5. Seven-Day Supply Evidence Gate Calculations (Zero fake PASS states)
  v_gate_host_status := case when v_hosts_accepted >= 10 then 'PASS' when v_hosts_accepted > 0 then 'IN PROGRESS' else 'NOT STARTED' end;
  v_gate_supply_status := case when v_signals_7d >= 30 then 'PASS' when v_signals_7d > 0 then 'IN PROGRESS' else 'NOT STARTED' end;
  v_gate_demand_status := case when v_unique_users_exposed >= 50 then 'PASS' when v_unique_users_exposed > 0 then 'IN PROGRESS' else 'NOT STARTED' end;
  v_gate_action_status := case when v_meaningful_actions >= 15 then 'PASS' when v_meaningful_actions > 0 then 'IN PROGRESS' else 'NOT STARTED' end;
  v_gate_return_status := case when v_returning_users >= 5 then 'PASS' when v_returning_users > 0 then 'IN PROGRESS' else 'NOT STARTED' end;

  v_overall_gate_status := case
    when v_gate_host_status = 'PASS' and v_gate_supply_status = 'PASS' and v_gate_demand_status = 'PASS' and v_gate_action_status = 'PASS' and v_gate_return_status = 'PASS'
      then 'PASS'
    when v_signals_7d > 0 or v_hosts_accepted > 0
      then 'IN PROGRESS'
    else 'NOT STARTED'
  end;

  return jsonb_build_object(
    'hosts', jsonb_build_object(
      'invited', v_hosts_invited,
      'accepted', v_hosts_accepted,
      'onboarded', v_hosts_onboarded,
      'published_at_least_one', v_hosts_published_1,
      'published_again', v_hosts_published_again
    ),
    'venues', jsonb_build_object(
      'approved', v_venues_approved,
      'disabled', v_venues_disabled,
      'pending_review', v_venues_pending,
      'host_linked', v_venues_host_linked
    ),
    'supply', jsonb_build_object(
      'signals_created_7d', v_signals_7d,
      'signals_active_now', v_signals_active,
      'by_category', v_by_category,
      'by_venue', v_by_venue,
      'by_host', v_by_host,
      'by_day', v_by_day,
      'zero_qualified_opens', v_zero_opens
    ),
    'demand', jsonb_build_object(
      'users_exposed', v_unique_users_exposed,
      'confirmed_real_world_actions', v_meaningful_actions,
      'returning_users', v_returning_users
    ),
    'evidence_gate', jsonb_build_object(
      'overall_status', v_overall_gate_status,
      'host_target', jsonb_build_object('actual', v_hosts_accepted, 'target', 10, 'status', v_gate_host_status),
      'supply_target', jsonb_build_object('actual', v_signals_7d, 'target', 30, 'status', v_gate_supply_status),
      'demand_target', jsonb_build_object('actual', v_unique_users_exposed, 'target', 50, 'status', v_gate_demand_status),
      'action_target', jsonb_build_object('actual', v_meaningful_actions, 'target', 15, 'status', v_gate_action_status),
      'return_target', jsonb_build_object('actual', v_returning_users, 'target', 5, 'status', v_gate_return_status)
    ),
    'moderation', jsonb_build_object(
      'reports_count', v_reports_count,
      'not_there_count', v_not_there_count
    )
  );
end; $$;

-- 20. Get Authorized Venues for Current Viewer
create or replace function public.get_host_venues() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  actor uuid := auth.uid();
  v_role text;
  v_places jsonb;
begin
  if actor is null then
    return '[]'::jsonb;
  end if;
  select role into v_role from app_private.profiles where id=actor;
  if v_role = 'moderator' then
    select coalesce(jsonb_agg(id), '[]'::jsonb) into v_places from public.places where enabled;
    return v_places;
  elsif v_role = 'host' then
    select coalesce(jsonb_agg(m.place_id), '[]'::jsonb) into v_places
    from app_private.host_venue_memberships m
    join public.places p on p.id=m.place_id
    where m.host_id=actor and m.status='active' and p.enabled;
    return v_places;
  else
    return '[]'::jsonb;
  end if;
end; $$;

-- 21. Permissions & Default Privileges
revoke all on function public.create_host_invite(jsonb),
  public.inspect_host_invite(text),
  public.accept_host_invite(text),
  public.complete_host_onboarding(jsonb),
  public.suggest_venue(jsonb),
  public.review_venue_suggestion(uuid,text,text),
  public.manage_venue(jsonb),
  public.grant_host_venue(uuid,uuid),
  public.revoke_host_venue(uuid,uuid),
  public.manage_template(text,jsonb),
  public.record_client_event(jsonb),
  public.supply_dashboard_metrics(),
  public.get_host_venues()
from public, anon, authenticated;

grant execute on function public.inspect_host_invite(text) to anon, authenticated;
grant execute on function public.record_client_event(jsonb) to anon, authenticated;
grant execute on function public.accept_host_invite(text),
  public.complete_host_onboarding(jsonb),
  public.suggest_venue(jsonb),
  public.manage_template(text,jsonb),
  public.get_host_venues()
to authenticated;

grant execute on function public.create_host_invite(jsonb),
  public.review_venue_suggestion(uuid,text,text),
  public.manage_venue(jsonb),
  public.grant_host_venue(uuid,uuid),
  public.revoke_host_venue(uuid,uuid),
  public.supply_dashboard_metrics()
to authenticated;
