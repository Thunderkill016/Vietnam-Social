begin;
create extension if not exists pgtap with schema extensions;
select extensions.no_plan();
set local search_path=public,extensions;
insert into auth.users(id,email,raw_user_meta_data) values
('20000000-0000-4000-8000-000000000001','host@test.local','{}'),
('20000000-0000-4000-8000-000000000002','member@test.local','{"role":"moderator"}'),
('20000000-0000-4000-8000-000000000003','second@test.local','{}'),
('20000000-0000-4000-8000-000000000004','third@test.local','{}'),
('20000000-0000-4000-8000-000000000005','mod@test.local','{}');
update app_private.profiles set role='host',display_name='Host kiểm thử' where id='20000000-0000-4000-8000-000000000001';
update app_private.profiles set role='moderator' where id='20000000-0000-4000-8000-000000000005';
insert into app_private.host_venue_memberships(host_id,place_id,granted_by) values ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000005');
create function pg_temp.input() returns jsonb language sql as $$
 select jsonb_build_object('request_id','30000000-0000-4000-8000-000000000001','title','Cầu lông kiểm thử','description','Fixture only','category','sport','place_id','10000000-0000-4000-8000-000000000001','starts_at',now()-interval '5 minutes','expires_at',now()+interval '1 hour','capacity_note','Còn 2 chỗ');
$$;
set local role anon;
select is((select count(*)::int from public.places),3,'anonymous can read local public places');
select throws_like($$select * from app_private.profiles$$,'%permission denied%','private profiles not exposed');
select throws_like($$select * from app_private.signals$$,'%permission denied%','raw signals cannot expose author IDs');
select throws_like($$select * from app_private.actions$$,'%permission denied%','attendance identities are private');
select throws_like($$select * from app_private.audit_events$$,'%permission denied%','audit is private');
select throws_like($$insert into public.places(city_id,name,area,longitude,latitude,h3_parent) values('hcm','Bad venue','hcm',106.67,10.8,'8665b2d6fffffff')$$,'%permission denied%','anonymous cannot create public venues');
select throws_like($$select public.publish_signal(pg_temp.input())$$,'%permission denied%','anonymous cannot publish');
select throws_like($$select public.act_on_signal(gen_random_uuid(),'join')$$,'%permission denied%','anonymous cannot act');
reset role;
set local role authenticated;
set local request.jwt.claim.sub='20000000-0000-4000-8000-000000000002';
select is(public.viewer_profile()->>'role','member','user-editable metadata cannot grant host/moderator');
select throws_ok($$select public.publish_signal(pg_temp.input())$$,'VS002','host required','member cannot publish');
select throws_ok($$select public.moderation_queue()$$,'VS002','moderator required','member cannot read moderation queue');
set local request.jwt.claim.sub='20000000-0000-4000-8000-000000000001';
select lives_ok($$select public.publish_signal(pg_temp.input())$$,'host publishes valid venue activity');
select is(public.publish_signal(pg_temp.input()),public.publish_signal(pg_temp.input()),'retry returns original ID');
select throws_ok($$select public.publish_signal(pg_temp.input() || jsonb_build_object('request_id',gen_random_uuid(),'latitude',10.8))$$,'VS005','unknown fields','personal coordinates are rejected at database boundary');
select throws_ok($$select public.publish_signal(pg_temp.input() || jsonb_build_object('request_id',gen_random_uuid(),'expires_at',now()+interval '25 hours'))$$,'VS005','invalid activity','database rejects excessive lifetime');
select throws_ok($$select public.publish_signal(pg_temp.input() || jsonb_build_object('request_id',gen_random_uuid(),'expires_at',now()-interval '1 hour'))$$,'VS005','invalid time','database rejects expired creation');
select throws_ok($$select public.publish_signal(pg_temp.input() || jsonb_build_object('request_id',gen_random_uuid(),'place_id',gen_random_uuid()))$$,'VS005','venue outside city boundary','unknown venue rejected');
select throws_ok($$select public.act_on_signal(public.publish_signal(pg_temp.input()),'confirm')$$,'VS004','self verification forbidden','host cannot self-confirm');
select set_config('test.signal',public.publish_signal(pg_temp.input())::text,true);
select is(public.get_signal(current_setting('test.signal')::uuid)->>'confidence','unconfirmed','host publication does not fabricate confidence');
select ok(not(public.get_signal(current_setting('test.signal')::uuid) ?| array['author_id','actor_id','user_id','email','reason']),'public projection strips private fields');
select is(jsonb_array_length(public.discover_signals('{"west":106.62,"east":106.705,"south":10.785,"north":10.855}')),1,'viewport returns active activity');
select is(jsonb_array_length(public.discover_signals('{"west":106.69,"east":106.70,"south":10.84,"north":10.85}')),0,'PostGIS excludes outside viewport');
select throws_ok($$select public.discover_signals('{"west":0,"east":180,"south":0,"north":90}')$$,'VS005','invalid bounds','unbounded viewport rejected');
set local request.jwt.claim.sub='20000000-0000-4000-8000-000000000002';
select lives_ok($$select public.act_on_signal(current_setting('test.signal')::uuid,'join')$$,'member can join');
select lives_ok($$select public.act_on_signal(current_setting('test.signal')::uuid,'join')$$,'join retry accepted');
select is(public.my_signal_state(current_setting('test.signal')::uuid)->>'attendance','join','own join state persisted');
select lives_ok($$select public.act_on_signal(current_setting('test.signal')::uuid,'confirm')$$,'member confirms');
select lives_ok($$select public.act_on_signal(current_setting('test.signal')::uuid,'confirm')$$,'confirm retry accepted');
select is((public.get_signal(current_setting('test.signal')::uuid)->>'confirmation_count')::int,1,'duplicate confirmations count once');
select is(public.get_signal(current_setting('test.signal')::uuid)->>'confidence','likely','one witness changes public confidence');
select throws_ok($$select public.act_on_signal(current_setting('test.signal')::uuid,'resolve')$$,'VS002','forbidden','member cannot resolve another host activity');
select throws_ok($$select public.act_on_signal(current_setting('test.signal')::uuid,'remove')$$,'VS002','forbidden','member cannot moderate');
select lives_ok($$select public.act_on_signal(current_setting('test.signal')::uuid,'not_there')$$,'member may correct their observation');
select is((public.get_signal(current_setting('test.signal')::uuid)->>'confirmation_count')::int,0,'opposing vote replaces previous verification');
select lives_ok($$select public.act_on_signal(current_setting('test.signal')::uuid,'report','Review this fixture')$$,'authenticated report accepted');
set local request.jwt.claim.sub='20000000-0000-4000-8000-000000000003';
select ok(public.my_signal_state(current_setting('test.signal')::uuid)->>'attendance' is null,'another user cannot see attendance identity');
select lives_ok($$select public.act_on_signal(current_setting('test.signal')::uuid,'not_there')$$,'second independent negative observation');
select is(public.get_signal(current_setting('test.signal')::uuid)->>'confidence','questionable','two negative observations block confidence');
set local request.jwt.claim.sub='20000000-0000-4000-8000-000000000005';
select is(jsonb_array_length(public.moderation_queue()),1,'moderator sees report queue');
reset role;
select is((select count(*)::int from app_private.actions where kind='attendance'),1,'idempotency enforced by unique key');
select is((select count(*)::int from app_private.audit_events where reason_code='confirm'),1,'retry does not generate duplicate audit/trust event');
-- Independent witnesses, not retries, raise confidence.
set local role authenticated;
set local request.jwt.claim.sub='20000000-0000-4000-8000-000000000002';
select public.act_on_signal(current_setting('test.signal')::uuid,'confirm');
set local request.jwt.claim.sub='20000000-0000-4000-8000-000000000003';
select public.act_on_signal(current_setting('test.signal')::uuid,'confirm');
set local request.jwt.claim.sub='20000000-0000-4000-8000-000000000004';
select public.act_on_signal(current_setting('test.signal')::uuid,'confirm');
select is(public.get_signal(current_setting('test.signal')::uuid)->>'confidence','verified','three independent witnesses reach provisional verified label');
reset role;
insert into public.places(id,city_id,name,area,longitude,latitude,h3_parent) values('10000000-0000-4000-8000-000000000099','hcm','Outside city fixture','Outside',108.0,12.0,'8665b2d6fffffff');
set local role authenticated;
set local request.jwt.claim.sub='20000000-0000-4000-8000-000000000001';
select throws_ok($$select public.publish_signal(pg_temp.input() || jsonb_build_object('request_id',gen_random_uuid(),'place_id','10000000-0000-4000-8000-000000000099'))$$,'VS005','venue outside city boundary','PostGIS rejects a catalog venue outside city boundary');
select set_config('test.future',public.publish_signal(pg_temp.input() || jsonb_build_object('request_id',gen_random_uuid(),'starts_at',now()+interval '1 day','expires_at',now()+interval '25 hours'))::text,true);
select ok(public.get_signal(current_setting('test.future')::uuid) is null,'future activity remains outside discovery window');
select lives_ok($$select public.act_on_signal(current_setting('test.future')::uuid,'resolve')$$,'owner may cancel scheduled activity before discovery');
reset role;
-- Audit-based limits count actual changes, including repeated vote flips.
insert into app_private.audit_events(actor_id,reason_code)
select '20000000-0000-4000-8000-000000000003'::uuid,'test_rate' from generate_series(1,30);
set local role authenticated;
set local request.jwt.claim.sub='20000000-0000-4000-8000-000000000003';
select throws_ok($$select public.act_on_signal(current_setting('test.signal')::uuid,'not_there')$$,'VS006','action rate limit','rate limit cannot be bypassed by flipping one vote');
reset role;
-- Expiry requires no status worker. Raw row deliberately remains active.
update app_private.signals set starts_at=now()-interval '2 hours',expires_at=now()-interval '1 minute' where id=current_setting('test.signal')::uuid;
set local role anon;
select ok(public.get_signal(current_setting('test.signal')::uuid) is null,'expired detail hidden without cron');
select is(jsonb_array_length(public.discover_signals('{"west":106.62,"east":106.705,"south":10.785,"north":10.855}')),0,'expired viewport hidden without cron');
reset role;
set local role authenticated;
set local request.jwt.claim.sub='20000000-0000-4000-8000-000000000002';
select throws_ok($$select public.act_on_signal(current_setting('test.signal')::uuid,'join')$$,'VS003','activity unavailable','expired activity cannot receive new actions');
reset role;
select ok((select bool_and(relrowsecurity) from pg_class c join pg_namespace n on n.oid=c.relnamespace where (n.nspname='app_private' or n.nspname='public') and c.relkind='r'),'all application tables have RLS enabled');
select * from extensions.finish();
rollback;
