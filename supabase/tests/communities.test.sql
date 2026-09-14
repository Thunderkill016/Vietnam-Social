begin;
create extension if not exists pgtap with schema extensions;
select extensions.no_plan();
set local search_path=public,extensions;

insert into auth.users(id,email,raw_user_meta_data) values
('20000000-0000-4000-8000-000000000301','community-a@test.local','{}'),
('20000000-0000-4000-8000-000000000302','community-b@test.local','{}');
update app_private.profiles set display_name='Community A' where id='20000000-0000-4000-8000-000000000301';
update app_private.profiles set display_name='Community B' where id='20000000-0000-4000-8000-000000000302';

insert into public.places(id,city_id,name,area,longitude,latitude,h3_parent,enabled)
values('10000000-0000-4000-8000-000000000301','hcm','Điểm cộng đồng thử nghiệm','Quận 1',106.700,10.780,'8665b5647ffffff',true);

select ok(
  not has_table_privilege('authenticated','app_private.communities','select'),
  'authenticated clients cannot read private communities table directly'
);
select ok(
  not has_table_privilege('authenticated','app_private.community_memberships','select'),
  'authenticated clients cannot read private community membership table directly'
);
select ok(
  (select bool_and(relrowsecurity) from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='app_private' and c.relname in ('communities','community_memberships')),
  'private community tables have RLS enabled'
);

set local role authenticated;
set local request.jwt.claim.sub='20000000-0000-4000-8000-000000000301';
select lives_ok(
  $$select public.create_community('{"name":"Chạy bộ Quận 1","description":"Cộng đồng chạy bộ thử nghiệm","category":"sport","area":"Quận 1"}'::jsonb)$$,
  'ordinary authenticated member can create a map-native community'
);

reset role;
select set_config(
  'app.test_community_id',
  (select id::text from app_private.communities where creator_id='20000000-0000-4000-8000-000000000301' limit 1),
  true
);
select is(
  (select role from app_private.community_memberships where community_id=current_setting('app.test_community_id')::uuid and user_id='20000000-0000-4000-8000-000000000301'),
  'owner',
  'community creator becomes owner automatically'
);

set local role authenticated;
set local request.jwt.claim.sub='20000000-0000-4000-8000-000000000302';
select is(
  (public.set_community_membership(current_setting('app.test_community_id')::uuid,true)->>'joined'),
  'true',
  'second member can join community'
);
select lives_ok(
  format(
    'select public.create_local_post(%L::jsonb)',
    jsonb_build_object(
      'request_id','30000000-0000-4000-8000-000000000301',
      'post_type','update',
      'body','Buổi chạy thử nghiệm sẽ bắt đầu vào chiều nay.',
      'community_id',current_setting('app.test_community_id')
    )::text
  ),
  'active member can publish a Local Post into community context'
);
select ok(
  jsonb_array_length(public.get_community_posts(current_setting('app.test_community_id')::uuid))=1,
  'community feed returns its Local Post'
);
select ok(
  jsonb_array_length(public.discover_communities('{"west":106.65,"south":10.75,"east":106.75,"north":10.82,"city_id":"hcm"}'::jsonb))>=1,
  'community is discoverable in its map viewport'
);

select is(
  (public.set_community_membership(current_setting('app.test_community_id')::uuid,false)->>'joined'),
  'false',
  'ordinary member can leave community'
);
select throws_ok(
  format(
    'select public.create_local_post(%L::jsonb)',
    jsonb_build_object(
      'request_id','30000000-0000-4000-8000-000000000302',
      'post_type','update',
      'body','Bài này không được đăng vì đã rời cộng đồng.',
      'community_id',current_setting('app.test_community_id')
    )::text
  ),
  'VS002',
  'join community before posting',
  'non-member cannot publish into community context'
);

set local request.jwt.claim.sub='20000000-0000-4000-8000-000000000301';
select throws_ok(
  format('select public.set_community_membership(%L::uuid,false)', current_setting('app.test_community_id')),
  'VS005',
  'owner cannot leave community',
  'owner cannot orphan community by leaving'
);

select * from extensions.finish();
rollback;
