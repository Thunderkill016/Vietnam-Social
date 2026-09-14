-- Phase E1 compatibility: local/CI may render deterministic fixture Place pages,
-- while production application boundaries exclude them and follow mutations remain blocked.
-- Also preserve the legacy map_opened `zoom` observation field in the strict event contract.

create or replace function app_private.project_place_social(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select jsonb_build_object(
    'id',p.id,
    'city_id',p.city_id,
    'name',p.name,
    'area',case
      when p.data_origin='fixture' then trim(p.area)
      else app_private.canonical_area(p.city_id,p.area)
    end,
    'longitude',p.longitude,
    'latitude',p.latitude,
    'h3_parent',p.h3_parent,
    'follower_count',case when p.data_origin='fixture' then 0 else (
      select count(*) from app_private.place_follows f where f.place_id=p.id
    ) end,
    'area_follower_count',case when p.data_origin='fixture' then 0 else (
      select count(*) from app_private.area_follows f
      where f.city_id=p.city_id and f.area=app_private.canonical_area(p.city_id,p.area)
    ) end,
    'viewer_follows',case
      when p.data_origin='fixture' or auth.uid() is null then false
      else exists(select 1 from app_private.place_follows f where f.user_id=auth.uid() and f.place_id=p.id)
    end,
    'viewer_follows_area',case
      when p.data_origin='fixture' or auth.uid() is null then false
      else exists(
        select 1 from app_private.area_follows f
        where f.user_id=auth.uid()
          and f.city_id=p.city_id
          and f.area=app_private.canonical_area(p.city_id,p.area)
      )
    end
  )
  from public.places p
  join public.cities c on c.id=p.city_id
  where p.id=p_id and p.enabled and c.active;
$$;
revoke all on function app_private.project_place_social(uuid) from public,anon,authenticated;

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
      'type','city_id','session_id','is_qualified','timestamp','duration_ms','zoom',
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
revoke all on function public.record_client_event(jsonb) from public,anon,authenticated;
grant execute on function public.record_client_event(jsonb) to anon,authenticated;
