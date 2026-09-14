begin;
create extension if not exists pgtap with schema extensions;
select extensions.no_plan();
set local search_path=public,extensions;

select has_column('public','places','data_origin','Places expose explicit data provenance');
select has_table('app_private','analytics_test_actors','server-owned test actor registry exists');
select has_table('app_private','social_action_events','authoritative social action ledger exists');
select has_column('app_private','analytics_events','event_source','analytics records observation source');
select has_column('app_private','analytics_events','traffic_class','analytics traffic class is persisted');
select has_column('app_private','analytics_events','subject_type','analytics supports generic social subjects');
select has_column('app_private','analytics_events','subject_id','analytics supports generic social subject ids');

-- Seed fixtures are identified by immutable UUID, never by mutable names.
select is(
  (select data_origin from public.places where id='10000000-0000-4000-8000-000000000001'),
  'fixture',
  'fixture 001 is explicitly classified'
);
select is(
  (select data_origin from public.places where id='10000000-0000-4000-8000-000000000002'),
  'fixture',
  'fixture 002 is explicitly classified'
);
select is(
  (select data_origin from public.places where id='10000000-0000-4000-8000-000000000003'),
  'fixture',
  'fixture 003 is explicitly classified'
);
update public.places set name='Tên đã đổi hoàn toàn' where id='10000000-0000-4000-8000-000000000001';
select is(
  (select data_origin from public.places where id='10000000-0000-4000-8000-000000000001'),
  'fixture',
  'renaming a fixture cannot change provenance'
);
select ok(
  app_private.project_place_social('10000000-0000-4000-8000-000000000001') is not null,
  'fixture Place remains readable for deterministic local and CI flows'
);
select is(
  app_private.project_place_social('10000000-0000-4000-8000-000000000001')->>'viewer_follows',
  'false',
  'fixture projection never fabricates follow state'
);

insert into public.places(id,city_id,name,area,longitude,latitude,h3_parent,enabled)
values(
  '10000000-0000-4000-8000-000000000901','hcm','E1 real place','E1 Real Area',106.69,10.79,'8665b5647ffffff',true
);
select is(
  (select data_origin from public.places where id='10000000-0000-4000-8000-000000000901'),
  'real',
  'new ordinary Places default to real provenance'
);
select is(
  app_private.canonical_area('hcm','E1 Real Area'),
  'E1 Real Area',
  'real Place creates a canonical safe area'
);

insert into auth.users(id,email,raw_user_meta_data) values
('20000000-0000-4000-8000-000000000901','e1-real@test.local','{}'),
('20000000-0000-4000-8000-000000000902','e1-test@test.local','{}'),
('20000000-0000-4000-8000-000000000903','e1-target@test.local','{}');
insert into app_private.analytics_test_actors(actor_id,reason)
values('20000000-0000-4000-8000-000000000902','pgTAP E1 test actor');
update app_private.profiles set role='moderator'
where id='20000000-0000-4000-8000-000000000901';

select ok(
  not has_table_privilege('anon','app_private.social_action_events','select'),
  'anon cannot read authoritative action ledger directly'
);
select ok(
  not has_table_privilege('authenticated','app_private.social_action_events','select'),
  'authenticated users cannot read authoritative action ledger directly'
);
select ok(
  not has_table_privilege('authenticated','app_private.analytics_test_actors','select'),
  'clients cannot read the test actor registry directly'
);

-- Client observations cannot self-assert evidence classification.
set local role anon;
select throws_ok(
  $$select public.record_client_event('{"type":"map_opened","city_id":"hcm","is_test":true}'::jsonb)$$,
  'VS005','client event contains forbidden fields',
  'browser cannot mark itself test'
);
select throws_ok(
  $$select public.record_client_event('{"type":"map_opened","city_id":"hcm","is_demo":true}'::jsonb)$$,
  'VS005','client event contains forbidden fields',
  'browser cannot mark itself demo'
);
select throws_ok(
  $$select public.record_client_event('{"type":"community_joined","city_id":"hcm"}'::jsonb)$$,
  'VS005','unsupported client observation',
  'browser cannot manufacture a successful social action event'
);
select lives_ok(
  $$select public.record_client_event('{"type":"map_opened","city_id":"hcm","session_id":"e1-anon-observation","zoom":13}'::jsonb)$$,
  'legacy map zoom remains an allowed observation field'
);
reset role;
select is(
  (select event_source from app_private.analytics_events where session_id='e1-anon-observation' order by created_at desc limit 1),
  'client_observation',
  'client telemetry is explicitly observational'
);
select is(
  (select traffic_class from app_private.analytics_events where session_id='e1-anon-observation' order by created_at desc limit 1),
  'real',
  'ordinary observation class is server-derived'
);
select is(
  (select count(*) from app_private.social_action_events),
  0::bigint,
  'map observations do not create authoritative social actions'
);

-- Real actor: one persisted follow creates exactly one authoritative fact despite retry.
set local role authenticated;
set local request.jwt.claim.sub='20000000-0000-4000-8000-000000000901';
select lives_ok(
  $$select public.set_follow('20000000-0000-4000-8000-000000000903',true)$$,
  'real person follow succeeds'
);
select lives_ok(
  $$select public.set_follow('20000000-0000-4000-8000-000000000903',true)$$,
  'person follow retry stays idempotent'
);
select lives_ok(
  $$select public.set_place_follow('10000000-0000-4000-8000-000000000901',true)$$,
  'real Place follow succeeds'
);
select throws_ok(
  $$select public.set_place_follow('10000000-0000-4000-8000-000000000001',true)$$,
  'VS003','place unavailable',
  'fixture Place cannot become a real follow target'
);
reset role;
select is(
  (select count(*) from app_private.social_action_events
   where actor_id='20000000-0000-4000-8000-000000000901' and action_type='person_follow'),
  1::bigint,
  'idempotent retry creates one person-follow fact'
);
select is(
  (select count(*) from app_private.social_action_events
   where actor_id='20000000-0000-4000-8000-000000000901' and traffic_class='real'),
  2::bigint,
  'real actor has two authoritative qualifying facts'
);

-- Test actor can mutate local fixtures/real test data, but evidence stays test-classified.
set local role authenticated;
set local request.jwt.claim.sub='20000000-0000-4000-8000-000000000902';
select lives_ok(
  $$select public.set_follow('20000000-0000-4000-8000-000000000903',true)$$,
  'registered test actor can exercise real business RPCs'
);
select lives_ok(
  $$select public.record_client_event('{"type":"map_opened","city_id":"hcm","session_id":"e1-test-observation"}'::jsonb)$$,
  'registered test actor can emit observation telemetry'
);
reset role;
select is(
  (select traffic_class from app_private.analytics_events where session_id='e1-test-observation' order by created_at desc limit 1),
  'test',
  'test classification is derived from private server registry'
);
select is(
  (select traffic_class from app_private.social_action_events
   where actor_id='20000000-0000-4000-8000-000000000902' order by created_at desc limit 1),
  'test',
  'authoritative test action is excluded from real evidence'
);

-- Moderator projection calculates WMLC only from real authoritative facts.
set local role authenticated;
set local request.jwt.claim.sub='20000000-0000-4000-8000-000000000903';
select throws_ok(
  $$select public.social_metrics()$$,
  'VS002','moderator required',
  'ordinary authenticated user cannot read operator social metrics'
);
set local request.jwt.claim.sub='20000000-0000-4000-8000-000000000901';
select is(
  public.social_metrics()->>'metric_version',
  'WMLC_v0',
  'operator projection versions WMLC explicitly'
);
select is(
  (public.social_metrics()->>'wmlc_v0')::integer,
  1,
  'WMLC counts one unique real actor, not observations or test actors'
);
select is(
  (public.social_metrics()->>'fixture_places')::integer,
  3,
  'operator metrics expose fixture inventory separately'
);
select ok(
  (public.social_metrics()->>'real_enabled_places')::integer >= 1,
  'operator real supply excludes fixtures while retaining real Places'
);
reset role;

select * from extensions.finish();
rollback;
