-- Phase E1 compatibility: deterministic fixture Activities remain usable in local/CI,
-- but only actions anchored to real Places can contribute authoritative real evidence.

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
  v_origin text;
begin
  if actor is null then raise exception using errcode='VS001',message='authentication required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
  select * into sig from app_private.signals where id=p_id for update;
  if sig.id is null or sig.status<>'active' or sig.expires_at<=now() then
    raise exception using errcode='VS003',message='activity unavailable';
  end if;

  select city_id,area,data_origin into v_city,v_area,v_origin
  from public.places
  where id=sig.place_id and enabled;

  if p_action not in ('resolve','remove') and (sig.starts_at>now()+interval '6 hours' or v_city is null) then
    raise exception using errcode='VS003',message='activity unavailable';
  end if;

  if p_action='resolve' or p_action='remove' then
    if (p_action='resolve' and sig.author_id<>actor)
       or (p_action='remove' and not exists(select 1 from app_private.profiles where id=actor and role='moderator')) then
      raise exception using errcode='VS002',message='forbidden';
    end if;
    update app_private.signals
    set status=case when p_action='resolve' then 'resolved' else 'removed' end
    where id=p_id;
  else
    if p_action not in ('join','go','confirm','not_there','report')
       or p_action is null or length(p_reason)>300 then
      raise exception using errcode='VS005',message='invalid action';
    end if;
    if actor=sig.author_id and p_action in ('confirm','not_there') then
      raise exception using errcode='VS004',message='self verification forbidden';
    end if;

    bucket:=case
      when p_action in ('join','go') then 'attendance'
      when p_action in ('confirm','not_there') then 'verification'
      else 'report'
    end;

    select value into old_value
    from app_private.actions
    where signal_id=p_id and user_id=actor and kind=bucket;
    if old_value=p_action then return; end if;

    if (select count(*) from app_private.audit_events where actor_id=actor and created_at>now()-interval '1 minute')>=30 then
      raise exception using errcode='VS006',message='action rate limit';
    end if;

    insert into app_private.actions(signal_id,user_id,kind,value,reason)
    values(p_id,actor,bucket,p_action,coalesce(p_reason,''))
    on conflict(signal_id,user_id,kind)
    do update set value=excluded.value,reason=excluded.reason,updated_at=now();

    -- Fixture-backed Activities are deterministic local/CI fixtures, not real product evidence.
    if v_origin='real' then
      if p_action='join' then
        perform app_private.record_social_action('activity_join','activity',p_id::text,v_city,v_area);
      elsif p_action='go' then
        perform app_private.record_social_action('activity_go','activity',p_id::text,v_city,v_area);
      elsif p_action='confirm' then
        perform app_private.record_social_action('activity_confirm','activity',p_id::text,v_city,v_area);
      end if;
    end if;
  end if;

  insert into app_private.audit_events(signal_id,actor_id,reason_code)
  values(p_id,actor,p_action);
end;
$$;

revoke all on function public.act_on_signal(uuid,text,text) from public,anon,authenticated;
grant execute on function public.act_on_signal(uuid,text,text) to authenticated;
