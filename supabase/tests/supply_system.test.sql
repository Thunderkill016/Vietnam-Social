begin;
create extension if not exists pgtap with schema extensions;
select extensions.no_plan();
set local search_path=public,extensions;

-- 1. Verify HCMC launch_state is 'pilot'
select is(
  (select launch_state from public.cities where id='hcm'),
  'pilot',
  'HCMC launch_state is pilot, not unproven live'
);

-- Setup Test Users
-- Moderator:
insert into auth.users(id,email,raw_user_meta_data) values
('20000000-0000-4000-8000-000000000101','mod@test.local','{}');
update app_private.profiles set role='moderator',display_name='Mod Operator' where id='20000000-0000-4000-8000-000000000101';

-- Regular Member:
insert into auth.users(id,email,raw_user_meta_data) values
('20000000-0000-4000-8000-000000000102','member@test.local','{}');
update app_private.profiles set role='member',display_name='Member Normal' where id='20000000-0000-4000-8000-000000000102';

-- Second Member (for double acceptance test):
insert into auth.users(id,email,raw_user_meta_data) values
('20000000-0000-4000-8000-000000000103','member2@test.local','{}');
update app_private.profiles set role='member',display_name='Member Two' where id='20000000-0000-4000-8000-000000000103';

-- Test Venue:
insert into public.places(id,city_id,name,area,longitude,latitude,h3_parent,enabled)
values('10000000-0000-4000-8000-000000000101','hcm','Sân Cầu Lông Kỳ Hòa Q10','Quận 10',106.671,10.772,'8665b5647ffffff',true);

-- 2. Non-moderator cannot create host invite
set local role authenticated;
set local request.jwt.claim.sub='20000000-0000-4000-8000-000000000102';

select throws_ok(
  $$select public.create_host_invite('{"note":"test"}'::jsonb)$$,
  'VS002',
  'moderator required',
  'normal member cannot create host invite'
);

-- 3. Moderator creates host invite
set local request.jwt.claim.sub='20000000-0000-4000-8000-000000000101';
select lives_ok(
  $$select public.create_host_invite('{"venue_id":"10000000-0000-4000-8000-000000000101","note":"Mời anh Nam CLB Cầu Lông"}'::jsonb)$$,
  'moderator can create host invite'
);

-- 4. Inspect Invite Token
reset role;
select set_config('test.token', (public.create_host_invite('{"venue_id":"10000000-0000-4000-8000-000000000101","note":"Invite for testing"}'::jsonb)->>'token'), true);

select is(
  (public.inspect_host_invite(current_setting('test.token'))::jsonb->>'status'),
  'pending',
  'inspect_host_invite returns pending status for valid token'
);

-- Invalid token throws error
select throws_ok(
  $$select public.inspect_host_invite('invalid_token_12345')$$,
  'VS003',
  'invite not found',
  'unknown invite token throws invite not found'
);

-- 5. Member accepts host invite
set local role authenticated;
set local request.jwt.claim.sub='20000000-0000-4000-8000-000000000102';

select is(
  (public.accept_host_invite(current_setting('test.token'))::jsonb->>'success'),
  'true',
  'member successfully accepts host invite'
);

-- Verify member profile was promoted to 'host' and NOT 'moderator'
select is(
  (select role from app_private.profiles where id='20000000-0000-4000-8000-000000000102'),
  'host',
  'user role is now host'
);

-- Verify host is automatically granted membership for the invited venue
select is(
  (select count(*) from app_private.host_venue_memberships where host_id='20000000-0000-4000-8000-000000000102' and place_id='10000000-0000-4000-8000-000000000101' and status='active'),
  1::bigint,
  'host is linked to invited venue'
);

-- 6. Idempotent acceptance for same user
select is(
  (public.accept_host_invite(current_setting('test.token'))::jsonb->>'already_accepted'),
  'true',
  'same user re-accepting returns idempotent success'
);

-- 7. Second user cannot accept the same invite
set local request.jwt.claim.sub='20000000-0000-4000-8000-000000000103';
select throws_ok(
  format('select public.accept_host_invite(%L)', current_setting('test.token')),
  'VS005',
  'invite already accepted',
  'second user cannot claim already accepted invite'
);

-- 8. Host Onboarding
set local request.jwt.claim.sub='20000000-0000-4000-8000-000000000102';
select lives_ok(
  $$select public.complete_host_onboarding('{"organizer_label":"CLB Cầu Lông Kỳ Hòa","bio":"Giao lưu phong trào mỗi tối","contact_channel":"Zalo: 0909123456"}'::jsonb)$$,
  'host can complete onboarding with organizer details'
);

select is(
  (select organizer_label from app_private.profiles where id='20000000-0000-4000-8000-000000000102'),
  'CLB Cầu Lông Kỳ Hòa',
  'organizer label is saved'
);

-- 9. Venue Authorization: Host publishes at authorized venue
select lives_ok(
  $$select public.publish_signal(jsonb_build_object(
    'request_id','30000000-0000-4000-8000-000000000101',
    'title','Cầu lông tối nay 18h',
    'description','Giao lưu sân 3',
    'category','sport',
    'place_id','10000000-0000-4000-8000-000000000101',
    'starts_at',now()-interval '5 minutes',
    'expires_at',now()+interval '2 hours',
    'capacity_note','Còn 2 slot'
  ))$$,
  'authorized host can publish activity at linked venue'
);

-- 10. Venue Authorization: Host cannot publish at unauthorized venue
insert into public.places(id,city_id,name,area,longitude,latitude,h3_parent,enabled)
values('10000000-0000-4000-8000-000000000102','hcm','Hồ Bơi Yết Kiêu Q1','Quận 1',106.698,10.787,'8665b5647ffffff',true);

select throws_ok(
  $$select public.publish_signal(jsonb_build_object(
    'request_id','30000000-0000-4000-8000-000000000102',
    'title','Bơi lội sáng chủ nhật',
    'description','Bơi tự do',
    'category','sport',
    'place_id','10000000-0000-4000-8000-000000000102',
    'starts_at',now()-interval '5 minutes',
    'expires_at',now()+interval '2 hours',
    'capacity_note',''
  ))$$,
  'VS002',
  'venue not authorized for host',
  'host cannot publish at venue without explicit authorization'
);

-- 11. Activity Templates Management
select is(
  (select public.manage_template('create', jsonb_build_object(
    'place_id','10000000-0000-4000-8000-000000000101',
    'title','Cầu lông cố định thứ 3-5-7',
    'description','Sân 3 Kỳ Hòa 18h-20h',
    'category','sport',
    'duration_minutes',120,
    'capacity_note','4-6 người'
  ))->>'status'),
  'created',
  'host can create activity template for authorized venue'
);

select ok(
  jsonb_array_length(public.manage_template('list', '{}'::jsonb)) >= 1,
  'host can list their active templates'
);

-- 12. Operator Supply Dashboard Access Control
-- Normal host cannot access supply dashboard
select throws_ok(
  $$select public.supply_dashboard_metrics()$$,
  'VS002',
  'moderator required',
  'host cannot access operator supply dashboard'
);

-- Moderator can access supply dashboard
set local request.jwt.claim.sub='20000000-0000-4000-8000-000000000101';
select ok(
  (public.supply_dashboard_metrics()->'evidence_gate'->>'overall_status') in ('NOT STARTED', 'IN PROGRESS', 'PASS'),
  'moderator retrieves supply dashboard metrics with valid evidence gate status'
);

-- 13. Verify RLS is enabled on all tables
reset role;
select ok(
  (select bool_and(relrowsecurity) from pg_class c join pg_namespace n on n.oid=c.relnamespace where (n.nspname='app_private' or n.nspname='public') and c.relkind='r'),
  'all public and private tables have row level security enabled'
);

select * from extensions.finish();
rollback;
