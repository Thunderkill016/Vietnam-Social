begin;
create extension if not exists pgtap with schema extensions;
select extensions.no_plan();
set local search_path=public,extensions;

insert into auth.users(id,email,raw_user_meta_data) values
('20000000-0000-4000-8000-000000000401','place-a@test.local','{}'),
('20000000-0000-4000-8000-000000000402','place-b@test.local','{}');
insert into public.places(id,city_id,name,area,longitude,latitude,h3_parent,enabled) values
('10000000-0000-4000-8000-000000000401','hcm','Place test A','Khu thử nghiệm',106.7,10.78,'8665b5647ffffff',true),
('10000000-0000-4000-8000-000000000402','hcm','Place test B','khu thử nghiệm',106.701,10.78,'8665b5647ffffff',true),
('10000000-0000-4000-8000-000000000403','hcm','Disabled place','Khu tắt',106.702,10.78,'8665b5647ffffff',false);

select has_table('app_private','place_follows','place edge table exists');
select has_table('app_private','area_follows','area edge table exists');
select ok((select bool_and(relrowsecurity) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='app_private' and c.relname in ('place_follows','area_follows')), 'RLS enabled on both private edge tables');
select ok(not has_table_privilege(r,t,p), r||' denied '||p||' on '||t)
from unnest(array['anon','authenticated']) r cross join unnest(array['app_private.place_follows','app_private.area_follows']) t cross join unnest(array['select','insert','update','delete']) p;
select ok(not has_function_privilege('anon',f,'execute'), 'anon denied '||f)
from unnest(array['public.set_place_follow(uuid,boolean)','public.set_area_follow(text,text,boolean)','public.get_my_local_follows()']) f;
select ok((select bool_and(prosecdef and 'search_path=""'=any(proconfig)) from pg_proc where oid in ('public.set_place_follow(uuid,boolean)'::regprocedure,'public.set_area_follow(text,text,boolean)'::regprocedure,'public.get_my_local_follows()'::regprocedure,'public.get_place_social_page(uuid)'::regprocedure,'public.get_area_social_page(text,text)'::regprocedure)), 'privileged RPCs have fixed empty search_path');

set local role anon;
select is(public.get_place_social_page('10000000-0000-4000-8000-000000000401')->'place'->>'viewer_follows','false','anon can read public place without a relationship');
select throws_ok($$select public.set_place_follow('10000000-0000-4000-8000-000000000401',true)$$,'42501',null,'anon place mutation fails');
select throws_ok($$select public.set_area_follow('hcm','Khu thử nghiệm',true)$$,'42501',null,'anon area mutation fails');
select throws_ok($$select * from app_private.place_follows$$,'42501',null,'anon direct read fails');
select is(public.get_area_social_page('hcm','unknown'),null::jsonb,'unknown area has no page');
reset role;

set local role authenticated;
set local request.jwt.claim.sub='';
select throws_ok($$select public.set_place_follow('10000000-0000-4000-8000-000000000401',true)$$,'VS001','authentication required','authenticated role alone is not identity');
set local request.jwt.claim.sub='20000000-0000-4000-8000-000000000401';
select throws_ok($$select * from app_private.area_follows$$,'42501',null,'authenticated direct read fails');
select throws_ok($$insert into app_private.place_follows(user_id,place_id) values(auth.uid(),'10000000-0000-4000-8000-000000000401')$$,'42501',null,'authenticated direct write fails');
select is(public.set_place_follow('10000000-0000-4000-8000-000000000401',true)->>'follower_count','1','follow succeeds');
select is(public.set_place_follow('10000000-0000-4000-8000-000000000401',true)->>'follower_count','1','retry is idempotent');
select throws_ok($$select public.set_place_follow('10000000-0000-4000-8000-000000000401',null)$$,'VS003','follow must be boolean','null is not an unfollow');
select is(public.set_area_follow('hcm','  khu thử nghiệm  ',true)->>'area','Khu thử nghiệm','area identity canonicalized');
select is(public.set_area_follow('hcm','Khu thử nghiệm',true)->>'follower_count','1','area retry is idempotent');
select throws_ok($$select public.set_area_follow('hcm','Khu thử nghiệm',null)$$,'VS003','follow must be boolean','null area intent rejected');
select throws_ok($$select public.set_area_follow('hcm','Unknown',true)$$,'VS003','area unavailable','unknown area rejected');
select throws_ok($$select public.set_place_follow('10000000-0000-4000-8000-000000000403',true)$$,'VS003','place unavailable','disabled place rejected');
select throws_ok($$select public.set_place_follow('10000000-0000-4000-8000-000000000499',true)$$,'VS003','place unavailable','missing place rejected');
select is(public.get_place_social_page('10000000-0000-4000-8000-000000000402')->'place'->>'viewer_follows_area','true','casing variants share follow state');
select is(public.get_place_social_page('10000000-0000-4000-8000-000000000402')->'place'->>'viewer_follows','false','area follow does not implicitly follow every place');
select is(jsonb_array_length(public.get_my_local_follows()->'places'),1,'own place returned');
select is(jsonb_array_length(public.get_my_local_follows()->'areas'),1,'own area returned');
select ok(not ((public.get_my_local_follows()->'areas'->0) ?| array['latitude','longitude','gps','location','user_id']), 'area projection has no GPS or person identity');
select is(jsonb_array_length(public.get_area_social_page('hcm','khu thử nghiệm')->'places'),2,'area returns approved public places only');

set local request.jwt.claim.sub='20000000-0000-4000-8000-000000000402';
select is(public.get_my_local_follows(),'{"places":[],"areas":[]}'::jsonb,'second viewer cannot retrieve first viewer relationships');
set local request.jwt.claim.sub='20000000-0000-4000-8000-000000000401';
select is(public.set_place_follow('10000000-0000-4000-8000-000000000401',false)->>'follower_count','0','unfollow succeeds');
select is(public.set_place_follow('10000000-0000-4000-8000-000000000401',false)->>'follower_count','0','unfollow retry idempotent');
select is(public.set_area_follow('hcm','Khu thử nghiệm',false)->>'follower_count','0','area unfollow succeeds');
select is(public.set_area_follow('hcm','Khu thử nghiệm',false)->>'follower_count','0','area unfollow retry idempotent');
reset role;
select is((select count(*) from app_private.community_memberships where user_id='20000000-0000-4000-8000-000000000401'),0::bigint,'area/place following never creates community membership');

-- Reuse real projections: published post/community are visible; expiry and moderation remove them.
insert into app_private.local_posts(id,author_id,request_id,post_type,body,place_id,area,longitude,latitude) values
('30000000-0000-4000-8000-000000000401','20000000-0000-4000-8000-000000000401','40000000-0000-4000-8000-000000000401','update','Bài địa phương kiểm thử.','10000000-0000-4000-8000-000000000401','Khu thử nghiệm',106.7,10.78);
insert into app_private.communities(id,creator_id,name,place_id,area,longitude,latitude,category) values
('50000000-0000-4000-8000-000000000401','20000000-0000-4000-8000-000000000401','Cộng đồng thử nghiệm','10000000-0000-4000-8000-000000000401','Khu thử nghiệm',106.7,10.78,'hobby');
insert into app_private.signals(id,author_id,request_id,place_id,title,category,starts_at,expires_at) values
('60000000-0000-4000-8000-000000000401','20000000-0000-4000-8000-000000000401','70000000-0000-4000-8000-000000000401','10000000-0000-4000-8000-000000000401','Hoạt động thử nghiệm','sport',now()-interval '1 hour',now()+interval '1 hour');
select is(jsonb_array_length(public.get_place_social_page('10000000-0000-4000-8000-000000000401')->k),1,'place aggregates '||k) from unnest(array['posts','activities','communities']) k;
select is(jsonb_array_length(public.get_area_social_page('hcm','Khu thử nghiệm')->k),1,'area aggregates '||k) from unnest(array['posts','activities','communities']) k;
update app_private.local_posts set moderation_state='removed' where id='30000000-0000-4000-8000-000000000401';
update app_private.communities set moderation_state='quarantined' where id='50000000-0000-4000-8000-000000000401';
update app_private.signals set expires_at=now()-interval '1 minute' where id='60000000-0000-4000-8000-000000000401';
select is(jsonb_array_length(public.get_place_social_page('10000000-0000-4000-8000-000000000401')->k),0,'place excludes unavailable '||k) from unnest(array['posts','activities','communities']) k;
select is(jsonb_array_length(public.get_area_social_page('hcm','Khu thử nghiệm')->k),0,'area excludes unavailable '||k) from unnest(array['posts','activities','communities']) k;
select * from extensions.finish();
rollback;
