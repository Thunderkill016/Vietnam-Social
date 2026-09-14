-- Local fixtures only. These venue names are intentionally fictional, never pilot evidence.
insert into public.cities(id,slug,name,country_code,timezone,default_longitude,default_latitude,default_zoom,active,launch_state,pilot_bounds,operational_boundary)
values(
  'hcm',
  'ho-chi-minh',
  'TP. Hồ Chí Minh',
  'VN',
  'Asia/Ho_Chi_Minh',
  106.675,
  10.815,
  13,
  true,
  'pilot',
  extensions.st_makeenvelope(106.35,10.35,107.05,11.20,4326),
  extensions.st_makeenvelope(106.35,10.35,107.05,11.20,4326)
) on conflict(id) do update set
  slug = excluded.slug,
  name = excluded.name,
  country_code = excluded.country_code,
  timezone = excluded.timezone,
  default_longitude = excluded.default_longitude,
  default_latitude = excluded.default_latitude,
  default_zoom = excluded.default_zoom,
  active = excluded.active,
  launch_state = excluded.launch_state,
  pilot_bounds = excluded.pilot_bounds,
  operational_boundary = excluded.operational_boundary;

-- H3 values are filled from the same h3-js resolution used by the app fixtures.
-- data_origin is authoritative; fixture identity never depends on the mutable display name.
insert into public.places(id,city_id,name,area,longitude,latitude,h3_parent,data_origin)
values('10000000-0000-4000-8000-000000000001','hcm','Sân thử nghiệm Phú Nhuận','Phú Nhuận',106.676,10.803,'8665b5647ffffff','fixture')
on conflict (id) do update set data_origin='fixture';
insert into public.places(id,city_id,name,area,longitude,latitude,h3_parent,data_origin)
values('10000000-0000-4000-8000-000000000002','hcm','Không gian thử nghiệm Tân Bình','Tân Bình',106.658,10.8,'8665b5647ffffff','fixture')
on conflict (id) do update set data_origin='fixture';
insert into public.places(id,city_id,name,area,longitude,latitude,h3_parent,data_origin)
values('10000000-0000-4000-8000-000000000003','hcm','Điểm thử nghiệm Gò Vấp','Gò Vấp',106.675,10.833,'8665b5647ffffff','fixture')
on conflict (id) do update set data_origin='fixture';
