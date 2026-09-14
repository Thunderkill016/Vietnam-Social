begin;
create extension if not exists pgtap with schema extensions;
select extensions.no_plan();
set local search_path=public,extensions;

insert into auth.users(id,email,raw_user_meta_data) values
('20000000-0000-4000-8000-000000000201','social-a@test.local','{}'),
('20000000-0000-4000-8000-000000000202','social-b@test.local','{}');
update app_private.profiles set display_name='Social A' where id='20000000-0000-4000-8000-000000000201';
update app_private.profiles set display_name='Social B' where id='20000000-0000-4000-8000-000000000202';

insert into public.places(id,city_id,name,area,longitude,latitude,h3_parent,enabled)
values('10000000-0000-4000-8000-000000000201','hcm','Điểm xã hội thử nghiệm','Quận 1',106.700,10.780,'8665b5647ffffff',true);

select ok(
  not has_table_privilege('authenticated','app_private.local_posts','select'),
  'authenticated clients cannot read private Local Post table directly'
);
select ok(
  not has_table_privilege('authenticated','app_private.follows','select'),
  'authenticated clients cannot read private follow graph directly'
);
select ok(
  (select bool_and(relrowsecurity) from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='app_private' and c.relname in ('local_posts','local_post_reactions','local_post_comments','follows','local_post_reports')),
  'all new private social tables have RLS enabled'
);

set local role authenticated;
set local request.jwt.claim.sub='20000000-0000-4000-8000-000000000201';

select lives_ok(
  $$select public.create_local_post('{"request_id":"30000000-0000-4000-8000-000000000201","post_type":"question","body":"Tối nay khu Quận 1 có hoạt động cộng đồng nào không?","area":"Quận 1"}'::jsonb)$$,
  'ordinary authenticated member can create an area-scoped Local Post without operator approval'
);

select is(
  (select count(*) from app_private.local_posts where author_id='20000000-0000-4000-8000-000000000201'),
  1::bigint,
  'Local Post is stored once'
);

select is(
  public.create_local_post('{"request_id":"30000000-0000-4000-8000-000000000201","post_type":"question","body":"Tối nay khu Quận 1 có hoạt động cộng đồng nào không?","area":"Quận 1"}'::jsonb),
  (select id from app_private.local_posts where author_id='20000000-0000-4000-8000-000000000201'),
  'create_local_post retries are idempotent'
);

select throws_ok(
  $$select public.create_local_post('{"request_id":"30000000-0000-4000-8000-000000000202","post_type":"question","body":"Không được nhận toạ độ từ client","area":"Quận 1","latitude":10.78}'::jsonb)$$,
  'VS005',
  'unknown fields',
  'raw client coordinate fields are rejected by the creation RPC'
);

select ok(
  jsonb_array_length(public.discover_local_posts('{"west":106.65,"south":10.75,"east":106.75,"north":10.82,"city_id":"hcm"}'::jsonb)) >= 1,
  'Local Post is discoverable from its map viewport'
);

select lives_ok(
  format('select public.toggle_local_post_reaction(%L::uuid)', (select id::text from app_private.local_posts where author_id='20000000-0000-4000-8000-000000000201')),
  'author can use the idempotent reaction toggle'
);

set local request.jwt.claim.sub='20000000-0000-4000-8000-000000000202';
select lives_ok(
  format('select public.comment_local_post(%L::uuid,%L)', (select id::text from app_private.local_posts where author_id='20000000-0000-4000-8000-000000000201'), 'Mình cũng đang muốn biết.'),
  'second member can comment on Local Post'
);

select is(
  (public.set_follow('20000000-0000-4000-8000-000000000201',true)->>'following'),
  'true',
  'second member can follow author'
);
select is(
  (public.set_follow('20000000-0000-4000-8000-000000000201',true)->>'follower_count'),
  '1',
  'repeated follow remains idempotent'
);
select throws_ok(
  $$select public.set_follow('20000000-0000-4000-8000-000000000202',true)$$,
  'VS005',
  'cannot follow self',
  'self follow is forbidden'
);

select lives_ok(
  format('select public.report_local_post(%L::uuid,%L)', (select id::text from app_private.local_posts where author_id='20000000-0000-4000-8000-000000000201'), 'Kiểm tra nội dung'),
  'report is accepted without automatically deleting the post'
);
select is(
  (select moderation_state from app_private.local_posts where author_id='20000000-0000-4000-8000-000000000201'),
  'published',
  'a single report does not auto-delete or quarantine a Local Post'
);

reset role;
select * from extensions.finish();
rollback;
