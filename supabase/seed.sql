-- Local fixtures only. These venue names are intentionally fictional, never pilot evidence.
insert into public.cities(id,name,pilot_bounds) values('hcm','TP. Hồ Chí Minh',extensions.st_makeenvelope(106.62,10.785,106.705,10.855,4326));
-- H3 values are filled from the same h3-js resolution used by the app fixtures.
insert into public.places(id,city_id,name,area,longitude,latitude,h3_parent) values('10000000-0000-4000-8000-000000000001','hcm','Sân thử nghiệm Phú Nhuận','Phú Nhuận',106.676,10.803,'8665b5647ffffff');
insert into public.places(id,city_id,name,area,longitude,latitude,h3_parent) values('10000000-0000-4000-8000-000000000002','hcm','Không gian thử nghiệm Tân Bình','Tân Bình',106.658,10.8,'8665b5647ffffff');
insert into public.places(id,city_id,name,area,longitude,latitude,h3_parent) values('10000000-0000-4000-8000-000000000003','hcm','Điểm thử nghiệm Gò Vấp','Gò Vấp',106.675,10.833,'8665b5647ffffff');
