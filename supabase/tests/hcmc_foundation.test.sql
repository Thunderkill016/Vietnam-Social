begin;
create extension if not exists pgtap with schema extensions;
select extensions.no_plan();
set local search_path=public,extensions;

-- 1. Verify city table structure and canonical HCMC record
select has_table('public','cities','cities table exists');
select has_column('public','cities','slug','cities has slug');
select has_column('public','cities','country_code','cities has country_code');
select has_column('public','cities','timezone','cities has timezone');
select has_column('public','cities','default_longitude','cities has default_longitude');
select has_column('public','cities','default_latitude','cities has default_latitude');
select has_column('public','cities','default_zoom','cities has default_zoom');
select has_column('public','cities','active','cities has active');
select has_column('public','cities','launch_state','cities has launch_state');
select has_column('public','cities','operational_boundary','cities has operational_boundary');

select is((select slug from public.cities where id='hcm'),'ho-chi-minh','hcm slug is ho-chi-minh');
select is((select timezone from public.cities where id='hcm'),'Asia/Ho_Chi_Minh','hcm timezone is Asia/Ho_Chi_Minh');
select is((select country_code from public.cities where id='hcm'),'VN','hcm country_code is VN');
select is((select active from public.cities where id='hcm'),true,'hcm is active');

-- 2. Anonymous can read cities
set local role anon;
select ok((select count(*) > 0 from public.cities where active),'anonymous can read active cities');
select throws_like($$insert into public.cities(id,slug,name) values('hn','hanoi','Hà Nội')$$,'%permission denied%','anonymous cannot insert cities');
reset role;

-- 3. City-aware venue publication validation
insert into auth.users(id,email,raw_user_meta_data) values
('20000000-0000-4000-8000-000000000088','hcm_host@test.local','{}');
update app_private.profiles set role='host',display_name='Host HCMC' where id='20000000-0000-4000-8000-000000000088';

-- Place inside HCMC (District 1 - Ben Thanh)
insert into public.places(id,city_id,name,area,longitude,latitude,h3_parent)
values('10000000-0000-4000-8000-000000000088','hcm','Sân Tao Đàn Q1','Quận 1',106.691,10.774,'8665b5647ffffff');

insert into app_private.host_venue_memberships(host_id,place_id,granted_by)
values('20000000-0000-4000-8000-000000000088','10000000-0000-4000-8000-000000000088','20000000-0000-4000-8000-000000000088');

-- Place outside HCMC (e.g. Da Nang)
insert into public.places(id,city_id,name,area,longitude,latitude,h3_parent)
values('10000000-0000-4000-8000-000000000089','hcm','Sân Đà Nẵng','Hải Châu',108.220,16.068,'8665b2d6fffffff');

set local role authenticated;
set local request.jwt.claim.sub='20000000-0000-4000-8000-000000000088';

-- Publish inside HCMC succeeds
select lives_ok(
  $$select public.publish_signal(jsonb_build_object(
    'request_id','30000000-0000-4000-8000-000000000088',
    'title','Giao lưu bóng rổ Tao Đàn',
    'description','Sân ngoài trời',
    'category','sport',
    'place_id','10000000-0000-4000-8000-000000000088',
    'starts_at',now()-interval '5 minutes',
    'expires_at',now()+interval '2 hours',
    'capacity_note','5 người'
  ))$$,
  'host publishes valid activity in HCMC'
);

-- Publish with venue outside HCMC boundary is rejected
select throws_ok(
  $$select public.publish_signal(jsonb_build_object(
    'request_id','30000000-0000-4000-8000-000000000089',
    'title','Hoạt động ngoài thành phố',
    'description','Địa điểm ngoài ranh giới',
    'category','sport',
    'place_id','10000000-0000-4000-8000-000000000089',
    'starts_at',now()-interval '5 minutes',
    'expires_at',now()+interval '2 hours',
    'capacity_note',''
  ))$$,
  'VS005',
  'venue outside city boundary',
  'venue outside active city boundary is rejected by PostGIS'
);

-- 4. Inactive city rejection
reset role;
insert into public.cities(id,slug,name,country_code,timezone,default_longitude,default_latitude,default_zoom,active,launch_state,operational_boundary)
values('inactive_city','inactive','Thành phố tạm ngừng','VN','Asia/Ho_Chi_Minh',106.69,10.77,13,false,'inactive',extensions.st_makeenvelope(106.35,10.35,107.05,11.20,4326));
insert into public.places(id,city_id,name,area,longitude,latitude,h3_parent)
values('10000000-0000-4000-8000-000000000090','inactive_city','Sân không kích hoạt','Quận 1',106.691,10.774,'8665b5647ffffff');

set local role authenticated;
set local request.jwt.claim.sub='20000000-0000-4000-8000-000000000088';
select throws_ok(
  $$select public.publish_signal(jsonb_build_object(
    'request_id','30000000-0000-4000-8000-000000000090',
    'title','Hoạt động ở city inactive',
    'description','Test inactive city',
    'category','sport',
    'place_id','10000000-0000-4000-8000-000000000090',
    'starts_at',now()-interval '5 minutes',
    'expires_at',now()+interval '2 hours',
    'capacity_note',''
  ))$$,
  'VS005',
  'venue outside city boundary',
  'inactive city cannot publish signals'
);

-- 5. City-aware discovery
select ok(jsonb_array_length(public.discover_signals(jsonb_build_object(
  'west',106.68,'east',106.70,'south',10.76,'north',10.78,'city_id','hcm'
))) >= 1,'discover_signals returns signal in Tao Dan Q1');

select is(jsonb_array_length(public.discover_signals(jsonb_build_object(
  'west',106.68,'east',106.70,'south',10.76,'north',10.78,'city_id','other_city'
))),0,'discover_signals respects city_id filtering');

reset role;
select ok((select bool_and(relrowsecurity) from pg_class c join pg_namespace n on n.oid=c.relnamespace where (n.nspname='app_private' or n.nspname='public') and c.relkind='r'),'all tables have RLS enabled');

select * from extensions.finish();
rollback;
