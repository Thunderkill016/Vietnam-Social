-- Task E1.1: forward-only supply evidence correction. No business mutations or WMLC changes.
-- Historical completed Signals remain supply; removed/future-created records do not.
create or replace view app_private.real_supply_signals as
select s.* from app_private.signals s
join public.places p on p.id=s.place_id
where p.enabled and p.data_origin='real' and s.status in ('active','resolved')
  and s.created_at<=now() and s.expires_at>s.starts_at
  and not exists(select 1 from app_private.analytics_test_actors t where t.actor_id=s.author_id);
revoke all on app_private.real_supply_signals from public,anon,authenticated;

create or replace function public.supply_dashboard_metrics() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  actor uuid := auth.uid();
  v_hosts_invited integer;
  v_hosts_accepted integer;
  v_hosts_onboarded integer;
  v_hosts_published_1 integer;
  v_hosts_published_again integer;
  v_venues_approved integer;
  v_venues_fixture integer;
  v_active_hosts integer;
  v_recurrent_hosts integer;
  v_active_venues integer;
  v_canonical_gate jsonb;
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
  select count(*) into v_hosts_invited from app_private.host_invites i where not exists(select 1 from app_private.analytics_test_actors t where t.actor_id in (i.invited_by,i.accepted_by)) and (i.venue_id is null or exists(select 1 from public.places p where p.id=i.venue_id and p.enabled and p.data_origin='real'));
  select count(*) into v_hosts_accepted from app_private.host_invites i where status='accepted' and not exists(select 1 from app_private.analytics_test_actors t where t.actor_id in (i.invited_by,i.accepted_by)) and (i.venue_id is null or exists(select 1 from public.places p where p.id=i.venue_id and p.enabled and p.data_origin='real'));
  select count(*) into v_hosts_onboarded from app_private.profiles where role in ('host','moderator') and onboarded_at is not null and disabled_at is null and not exists(select 1 from app_private.analytics_test_actors t where t.actor_id=profiles.id);

  -- Hosts who published >= 1 real signal
  select count(distinct author_id) into v_hosts_published_1 from app_private.real_supply_signals;
  -- Hosts who published >= 2 real signals on separate days
  select count(*) into v_hosts_published_again from (
    select author_id from app_private.real_supply_signals group by author_id having count(distinct (created_at at time zone 'Asia/Ho_Chi_Minh')::date) >= 2
  ) q;

  -- 2. Venues
  select count(*) filter(where enabled) into v_venues_approved from public.places where data_origin='real';
  select count(*) filter(where not enabled) into v_venues_disabled from public.places where data_origin='real';
  select count(*) into v_venues_pending from app_private.venue_suggestions v where status='pending' and not exists(select 1 from app_private.analytics_test_actors t where t.actor_id=v.suggested_by);
  select count(distinct place_id) into v_venues_host_linked from app_private.host_venue_memberships m join public.places p on p.id=m.place_id where m.status='active' and p.enabled and p.data_origin='real' and not exists(select 1 from app_private.analytics_test_actors t where t.actor_id=m.host_id);
  select count(*) into v_venues_fixture from public.places where data_origin='fixture';

  -- 3. Supply (7-day window)
  select count(*) into v_signals_7d from app_private.real_supply_signals where created_at >= now() - interval '7 days';
  select count(*) into v_signals_active from app_private.real_supply_signals where status='active' and expires_at > now() and starts_at <= now() + interval '6 hours';

  -- Supply distributions
  select coalesce(jsonb_object_agg(category, c), '{}'::jsonb) into v_by_category
  from (select category, count(*) as c from app_private.real_supply_signals where created_at >= now() - interval '7 days' group by category) q;

  select coalesce(jsonb_agg(q), '[]'::jsonb) into v_by_venue from (
    select p.name as place_name, count(s.*) as signal_count
    from app_private.real_supply_signals s join public.places p on p.id = s.place_id
    where s.created_at >= now() - interval '7 days'
    group by p.id,p.name order by count(s.*) desc limit 10
  ) q;

  select coalesce(jsonb_agg(q), '[]'::jsonb) into v_by_host from (
    select pr.display_name, count(s.*) as signal_count
    from app_private.real_supply_signals s join app_private.profiles pr on pr.id = s.author_id
    where s.created_at >= now() - interval '7 days'
    group by pr.id,pr.display_name order by count(s.*) desc limit 10
  ) q;

  select coalesce(jsonb_agg(q), '[]'::jsonb) into v_by_day from (
    select to_char((created_at at time zone 'Asia/Ho_Chi_Minh')::date, 'YYYY-MM-DD') as day, count(*) as count
    from app_private.real_supply_signals where created_at >= now() - interval '7 days'
    group by 1 order by 1
  ) q;

  -- Signals with zero qualified opens
  select coalesce(jsonb_agg(q), '[]'::jsonb) into v_zero_opens from (
    select s.id, s.title, s.starts_at from app_private.real_supply_signals s
    where s.created_at >= now() - interval '7 days'
      and not exists (
        select 1 from app_private.analytics_events e
        where e.signal_id = s.id and e.event_type = 'signal_opened' and e.is_qualified and e.traffic_class='real' and e.event_source='client_observation' and e.created_at>=now()-interval '7 days' and e.created_at<=now() and not exists(select 1 from app_private.analytics_test_actors t where t.actor_id=e.actor_id)
      )
    order by s.starts_at desc limit 20
  ) q;

  -- 4. Demand Evidence (Filtering out demo/test events)
  -- Unique target users exposed to real listings (qualified opens + distinct viewers)
  select coalesce(count(distinct session_id), 0) into v_unique_users_exposed
  from app_private.analytics_events e
  where e.traffic_class='real' and e.event_source='client_observation' and e.created_at>=now()-interval '7 days' and e.created_at<=now() and not exists(select 1 from app_private.analytics_test_actors t where t.actor_id=e.actor_id) and exists(select 1 from app_private.real_supply_signals s where s.id=e.signal_id) and (event_type='signal_impression' or is_qualified) and session_id<>'' and event_type in ('signal_opened', 'signal_impression') and created_at >= now() - interval '7 days';

  -- Meaningful actions: count of confirmed real-world actions (join/go + post-start verification by non-author)
  select count(*) into v_meaningful_actions
  from (
    select a1.signal_id, a1.user_id
    from app_private.actions a1
    join app_private.actions a2 on a2.signal_id = a1.signal_id and a2.user_id = a1.user_id and a2.kind = 'verification' and a2.value = 'confirm'
    join app_private.real_supply_signals s on s.id = a1.signal_id
    where a1.kind = 'attendance' and a1.value in ('join', 'go')
      and s.author_id <> a1.user_id -- Non-author
      and a2.updated_at >= s.starts_at and a2.updated_at < s.expires_at
      and a2.updated_at<=now() and a1.updated_at<=a2.updated_at
      and not exists(select 1 from app_private.analytics_test_actors t where t.actor_id=a1.user_id)
      and s.created_at >= now() - interval '7 days'
  ) q;

  -- Voluntary returning users (distinct users who acted in >= 2 distinct days)
  select count(*) into v_returning_users from (
    select user_id from app_private.actions a
    where exists(select 1 from app_private.real_supply_signals s where s.id=a.signal_id and s.author_id<>a.user_id)
      and not exists(select 1 from app_private.analytics_test_actors t where t.actor_id=a.user_id)
      and updated_at<=now() and updated_at >= now() - interval '7 days'
    group by user_id having count(distinct (updated_at at time zone 'Asia/Ho_Chi_Minh')::date) >= 2
  ) q;

  -- Moderation flags
  select count(*) into v_reports_count from app_private.actions a where exists(select 1 from app_private.real_supply_signals s where s.id=a.signal_id) and not exists(select 1 from app_private.analytics_test_actors t where t.actor_id=a.user_id) and updated_at<=now() and kind='report';
  select count(*) into v_not_there_count from app_private.actions a where exists(select 1 from app_private.real_supply_signals s where s.id=a.signal_id) and not exists(select 1 from app_private.analytics_test_actors t where t.actor_id=a.user_id) and updated_at<=now() and kind='verification' and value='not_there';

  -- 5. Seven-Day Supply Evidence Gate Calculations (Zero fake PASS states)
  v_gate_host_status := case when v_hosts_accepted >= 10 then 'PASS' when v_hosts_accepted > 0 then 'IN PROGRESS' else 'NOT STARTED' end;
  v_gate_supply_status := case when v_signals_7d >= 30 then 'PASS' when v_signals_7d > 0 then 'IN PROGRESS' else 'NOT STARTED' end;
  v_gate_demand_status := case when v_unique_users_exposed >= 50 then 'PASS' when v_unique_users_exposed > 0 then 'IN PROGRESS' else 'NOT STARTED' end;
  v_gate_action_status := case when v_meaningful_actions >= 15 then 'PASS' when v_meaningful_actions > 0 then 'IN PROGRESS' else 'NOT STARTED' end;
  v_gate_return_status := case when v_returning_users >= 5 then 'PASS' when v_returning_users > 0 then 'IN PROGRESS' else 'NOT STARTED' end;

  -- Canonical Task 003 readiness: 5 active hosts, 3 recurrent hosts,
  -- 3 currently discoverable venues, 10 persisted confirmed participations.
  select count(distinct author_id) into v_active_hosts from app_private.real_supply_signals where created_at>=now()-interval '7 days';
  select count(*) into v_recurrent_hosts from (
    select author_id from app_private.real_supply_signals where created_at>=now()-interval '7 days'
    group by author_id having count(distinct (created_at at time zone 'Asia/Ho_Chi_Minh')::date)>=2
  ) q;
  select count(distinct place_id) into v_active_venues from app_private.real_supply_signals
    where status='active' and expires_at>now() and starts_at<=now()+interval '6 hours';
  select jsonb_object_agg(name,jsonb_build_object('actual',actual,'target',target,
    'status',case when actual>=target then 'PASS' when actual>0 then 'IN PROGRESS' else 'NOT STARTED' end))
  into v_canonical_gate from (values
    ('active_hosts',v_active_hosts,5),('recurrent_hosts',v_recurrent_hosts,3),
    ('active_venues',v_active_venues,3),('confirmed_actions',v_meaningful_actions,10)
  ) targets(name,actual,target);
  v_overall_gate_status := case
    when v_active_hosts>=5 and v_recurrent_hosts>=3 and v_active_venues>=3 and v_meaningful_actions>=10 then 'PASS'
    when v_active_hosts>0 or v_recurrent_hosts>0 or v_active_venues>0 or v_meaningful_actions>0 then 'IN PROGRESS'
    else 'NOT STARTED' end;

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
      'fixture', v_venues_fixture,
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
    'evidence_gate', v_canonical_gate || jsonb_build_object(
      'definition','real_supply_v1',
      'legacy_targets_informational',true,
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


revoke all on function public.supply_dashboard_metrics() from public,anon,authenticated;
grant execute on function public.supply_dashboard_metrics() to authenticated;
