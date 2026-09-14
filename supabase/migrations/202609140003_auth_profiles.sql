-- Vietnam Social: Task 003 — OAuth Profile Sync
-- Automatically synchronizes OAuth metadata (e.g. Google full_name/name) into display_name
-- while preserving strict authorization invariants (role defaults to member, never taken from user metadata).

create or replace function app_private.new_user() returns trigger language plpgsql security definer set search_path='' as $$
declare
  v_name text;
begin
  v_name := coalesce(
    nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
    nullif(trim(new.raw_user_meta_data->>'name'), ''),
    'Thành viên'
  );
  if length(v_name) > 80 then
    v_name := substr(v_name, 1, 80);
  end if;
  insert into app_private.profiles(id, display_name)
  values(new.id, v_name)
  on conflict (id) do update set
    display_name = case
      when app_private.profiles.display_name = 'Thành viên' and v_name <> 'Thành viên'
      then v_name
      else app_private.profiles.display_name
    end;
  return new;
end; $$;
