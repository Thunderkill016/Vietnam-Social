-- Migration 202609140005_host_venues_rpc.sql
-- Exposes get_host_venues RPC to authenticated callers for authorized venue listing

create or replace function public.get_host_venues() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  actor uuid := auth.uid();
  v_role text;
  v_places jsonb;
begin
  if actor is null then
    return '[]'::jsonb;
  end if;
  select role into v_role from app_private.profiles where id=actor;
  if v_role = 'moderator' then
    select coalesce(jsonb_agg(id), '[]'::jsonb) into v_places from public.places where enabled;
    return v_places;
  elsif v_role = 'host' then
    select coalesce(jsonb_agg(m.place_id), '[]'::jsonb) into v_places
    from app_private.host_venue_memberships m
    join public.places p on p.id=m.place_id
    where m.host_id=actor and m.status='active' and p.enabled;
    return v_places;
  else
    return '[]'::jsonb;
  end if;
end; $$;

revoke all on function public.get_host_venues() from public, anon, authenticated;
grant execute on function public.get_host_venues() to authenticated;
