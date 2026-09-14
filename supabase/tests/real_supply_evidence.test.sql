begin;
create extension if not exists pgtap with schema extensions;
select extensions.no_plan();
set local search_path=public,extensions;
-- All mutations are rolled back; no production seed or role changes.
insert into auth.users(id,email,raw_user_meta_data) values
('20000000-0000-4000-8000-000000001001','e11-host@test.local','{}'),
('20000000-0000-4000-8000-000000001002','e11-participant@test.local','{}'),
('20000000-0000-4000-8000-000000001003','e11-registry@test.local','{}');
update app_private.profiles set role='moderator' where id='20000000-0000-4000-8000-000000001001';
insert into app_private.analytics_test_actors(actor_id) values('20000000-0000-4000-8000-000000001003');
set local request.jwt.claim.sub='20000000-0000-4000-8000-000000001001';
select is((select count(*) from public.places where enabled),3::bigint,'three enabled raw fixtures');
select is(public.supply_dashboard_metrics()#>>'{venues,approved}','0','fixtures are not approved real supply');
select is(public.supply_dashboard_metrics()#>>'{venues,fixture}','3','fixture inventory is explicit');
select is(public.supply_dashboard_metrics()#>>'{evidence_gate,active_venues,actual}','0','fixtures cannot activate venues');
select ok(not has_table_privilege('authenticated','app_private.real_supply_signals','select'),'private evidence view is inaccessible');
select ok(not has_function_privilege('anon','public.supply_dashboard_metrics()','execute'),'anonymous RPC denied');
set local role authenticated;
set local request.jwt.claim.sub='20000000-0000-4000-8000-000000001002';
select throws_ok($$select public.supply_dashboard_metrics()$$,'VS002','moderator required','ordinary user denied');
set local request.jwt.claim.sub='20000000-0000-4000-8000-000000001001';
select lives_ok($$select public.supply_dashboard_metrics()$$,'moderator permitted');
reset role;
-- Existing fixture Activity business flow is still executable.
select lives_ok($$select public.publish_signal(jsonb_build_object(
 'request_id','30000000-0000-4000-8000-000000001001',
 'place_id','10000000-0000-4000-8000-000000000001','title','Fixture Activity test',
 'category','sport','starts_at',now()-interval '1 hour','expires_at',now()+interval '1 hour'))$$,'fixture Activity publishing remains usable');
select is(public.supply_dashboard_metrics()#>>'{supply,signals_created_7d}','0','fixture Activity excluded');
select is(public.supply_dashboard_metrics()#>>'{evidence_gate,overall_status}','NOT STARTED','fixture activity cannot advance readiness');
insert into public.places(id,city_id,name,area,longitude,latitude,h3_parent,enabled)
values('10000000-0000-4000-8000-000000001001','hcm','Real evidence venue','Quận 1',106.69,10.79,'8665b5647ffffff',true);
-- Test author on real venue is excluded even when business state persists.
update app_private.profiles set role='moderator' where id='20000000-0000-4000-8000-000000001003';
set local request.jwt.claim.sub='20000000-0000-4000-8000-000000001003';
select lives_ok($$select public.publish_signal(jsonb_build_object(
 'request_id','30000000-0000-4000-8000-000000001003',
 'place_id','10000000-0000-4000-8000-000000001001','title','Registry Activity test',
 'category','sport','starts_at',now()-interval '1 hour','expires_at',now()+interval '1 hour'))$$,'registered test host can publish at real venue');
set local request.jwt.claim.sub='20000000-0000-4000-8000-000000001001';
select is(public.supply_dashboard_metrics()#>>'{supply,signals_created_7d}','0','registry author excluded');
select is(public.supply_dashboard_metrics()#>>'{evidence_gate,overall_status}','NOT STARTED','real inventory and test activity cannot advance gate');
-- Local midnight boundary: same UTC date, different Vietnam dates, always within the week.
insert into app_private.signals(id,request_id,author_id,place_id,title,category,starts_at,expires_at,created_at)
select ('40000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,gen_random_uuid(),
 '20000000-0000-4000-8000-000000001001','10000000-0000-4000-8000-000000001001',
 'Real Activity evidence','sport',now()-interval '1 hour',now()+interval '1 hour',
 (((now() at time zone 'Asia/Ho_Chi_Minh')::date-2+time '00:00') at time zone 'Asia/Ho_Chi_Minh') + (case when n=1 then interval '-1 minute' else interval '1 minute' end)
from generate_series(1,2) n;
select is(public.supply_dashboard_metrics()#>>'{supply,signals_created_7d}','2','real supply increments');
select is(public.supply_dashboard_metrics()#>>'{hosts,published_at_least_one}','1','only real host counts');
select is(public.supply_dashboard_metrics()#>>'{hosts,published_again}','1','recurrence uses Vietnam calendar dates');
select is(public.supply_dashboard_metrics()#>>'{evidence_gate,recurrent_hosts,actual}','1','seven day recurrence uses Vietnam dates');
select is(public.supply_dashboard_metrics()#>>'{evidence_gate,active_venues,actual}','1','real discoverable venue counts');
select is(public.supply_dashboard_metrics()#>>'{evidence_gate,active_hosts,target}','5','canonical host target');
select is(public.supply_dashboard_metrics()#>>'{evidence_gate,recurrent_hosts,target}','3','canonical recurrence target');
select is(public.supply_dashboard_metrics()#>>'{evidence_gate,active_venues,target}','3','canonical venue target');
select is(public.supply_dashboard_metrics()#>>'{evidence_gate,confirmed_actions,target}','10','canonical confirmations target');
-- Real participant plus registered participant and author self-confirm: only real non-author counts.
insert into app_private.actions(signal_id,user_id,kind,value,updated_at)
select '40000000-0000-4000-8000-000000000001',u.id,k.kind,k.value,now()-k.age
from auth.users u cross join (values('attendance','join',interval '45 minutes'),('verification','confirm',interval '30 minutes')) k(kind,value,age)
where u.id in ('20000000-0000-4000-8000-000000001001','20000000-0000-4000-8000-000000001002','20000000-0000-4000-8000-000000001003');
insert into app_private.actions(signal_id,user_id,kind,value,updated_at)
select s.id,'20000000-0000-4000-8000-000000001002',k.kind,k.value,now()-k.age
from app_private.signals s cross join (values('attendance','go',interval '45 minutes'),('verification','confirm',interval '30 minutes')) k(kind,value,age)
where s.request_id='30000000-0000-4000-8000-000000001001';
select is(public.supply_dashboard_metrics()#>>'{demand,confirmed_real_world_actions}','1','only same real participant valid post-start pair counts');
update app_private.actions set updated_at=now()-interval '2 hours' where kind='verification' and signal_id='40000000-0000-4000-8000-000000000001';
select is(public.supply_dashboard_metrics()#>>'{demand,confirmed_real_world_actions}','0','pre-start confirmations excluded');
-- Legacy observation cannot remove a zero-open row or inflate demand.
insert into app_private.analytics_events(event_type,city_id,signal_id,session_id,is_qualified)
values('signal_opened','hcm','40000000-0000-4000-8000-000000000001','legacy',true);
select is(public.supply_dashboard_metrics()#>>'{demand,users_exposed}','0','unverified legacy is not real demand');
select is(jsonb_array_length(public.supply_dashboard_metrics()#>'{supply,zero_qualified_opens}'),2,'legacy open cannot suppress zero-open supply');
insert into app_private.analytics_events(event_type,city_id,signal_id,session_id,is_qualified,traffic_class,event_source)
values('signal_opened','hcm','40000000-0000-4000-8000-000000000001','verified',true,'real','client_observation');
select is(public.supply_dashboard_metrics()#>>'{demand,users_exposed}','1','qualified verified observation counts');
select is(jsonb_array_length(public.supply_dashboard_metrics()#>'{supply,zero_qualified_opens}'),1,'verified qualified open suppresses only its real Signal');
select is(public.social_metrics()->>'wmlc_v0','0','browser observations and Activity state cannot manufacture WMLC');
-- Persisted actions on distinct Vietnam dates drive return, not browser observations.
update app_private.actions a set updated_at=s.created_at from app_private.signals s where s.id=a.signal_id;
insert into app_private.actions(signal_id,user_id,kind,value,updated_at)
select id,'20000000-0000-4000-8000-000000001002','attendance','go',created_at from app_private.signals where id='40000000-0000-4000-8000-000000000002';
select is(public.supply_dashboard_metrics()#>>'{demand,returning_users}','1','return uses persisted actions across Vietnam dates');
update public.places set enabled=false where id='10000000-0000-4000-8000-000000001001';
select is(public.supply_dashboard_metrics()#>>'{supply,signals_created_7d}','0','disabled real venue excludes all supply');
select is(public.supply_dashboard_metrics()#>>'{demand,returning_users}','0','disabled venue actions excluded');
select is(public.supply_dashboard_metrics()#>>'{evidence_gate,overall_status}','NOT STARTED','disabled supply cannot advance readiness');
-- Positive gate proof: enough persisted real supply passes; observations alone did not.
update public.places set enabled=true where id='10000000-0000-4000-8000-000000001001';
insert into public.places(id,city_id,name,area,longitude,latitude,h3_parent,enabled)
select ('10000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'hcm','Gate venue '||n,'Quận 1',106.69,10.79,'8665b5647ffffff',true from generate_series(1002,1003) n;
insert into auth.users(id,email,raw_user_meta_data)
select ('20000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'e11-gate-'||n||'@test.local','{}'::jsonb from generate_series(1011,1014) n;
insert into app_private.signals(id,request_id,author_id,place_id,title,category,starts_at,expires_at,created_at)
select ('40000000-0000-4000-8000-'||lpad((100+n)::text,12,'0'))::uuid,gen_random_uuid(),
 ('20000000-0000-4000-8000-'||lpad((1011+(n%4))::text,12,'0'))::uuid,
 ('10000000-0000-4000-8000-'||lpad((1001+(n%3))::text,12,'0'))::uuid,
 'Positive gate Activity','sport',now()-interval '1 hour',now()+interval '1 hour',
 (((now() at time zone 'Asia/Ho_Chi_Minh')::date-3+time '12:00') at time zone 'Asia/Ho_Chi_Minh') + (n/4)*interval '1 day'
from generate_series(0,9) n;
insert into app_private.actions(signal_id,user_id,kind,value,updated_at)
select s.id,'20000000-0000-4000-8000-000000001002',k.kind,k.value,now()-k.age
from app_private.signals s cross join (values('attendance','go',interval '45 minutes'),('verification','confirm',interval '30 minutes')) k(kind,value,age)
where s.title='Positive gate Activity';
select is(public.supply_dashboard_metrics()#>>'{evidence_gate,active_hosts,actual}','5','five real publishers count regardless of email text');
select is(public.supply_dashboard_metrics()#>>'{evidence_gate,active_venues,actual}','3','three real active venues count');
select is(public.supply_dashboard_metrics()#>>'{evidence_gate,confirmed_actions,actual}','10','ten independent persisted participation pairs count');
select is(public.supply_dashboard_metrics()#>>'{evidence_gate,overall_status}','PASS','only complete canonical real evidence passes');
insert into app_private.analytics_test_actors(actor_id)
select distinct author_id from app_private.signals on conflict do nothing;
select is(public.supply_dashboard_metrics()#>>'{evidence_gate,overall_status}','NOT STARTED','registry reclassification excludes all test supply');
select is(public.supply_dashboard_metrics()#>>'{supply,by_category}','{}','test categories excluded');
select is(public.supply_dashboard_metrics()#>>'{supply,by_host}','[]','test hosts excluded');
select is(public.supply_dashboard_metrics()#>>'{supply,by_venue}','[]','test venue distribution excluded');
select is(public.supply_dashboard_metrics()#>>'{supply,by_day}','[]','test daily distribution excluded');
select * from finish();
rollback;
