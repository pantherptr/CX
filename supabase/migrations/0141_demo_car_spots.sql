-- Demo placement: cars that still have no exact spot get one on a real Milan street, so the map is full while the
-- listings are test data. Only cars with no spot and city 'Milan' are touched; a host (or Admin → Cars → "Move pin")
-- can put any of them on its true address later. Coordinates are those of the streets, to within a block.

with spots(n, lat, lng, label) as (
  values
    (1,  45.46405, 9.19175, 'Piazza del Duomo, 20122 Milano, Italy'),
    (2,  45.46068, 9.18598, 'Via Torino 40, 20123 Milano, Italy'),
    (3,  45.47780, 9.20580, 'Corso Buenos Aires 20, 20124 Milano, Italy'),
    (4,  45.46890, 9.19590, 'Via Monte Napoleone 8, 20121 Milano, Italy'),
    (5,  45.48250, 9.18800, 'Corso Como 10, 20154 Milano, Italy'),
    (6,  45.46620, 9.18570, 'Via Dante 14, 20121 Milano, Italy'),
    (7,  45.46790, 9.17590, 'Piazza Cadorna 14, 20123 Milano, Italy'),
    (8,  45.45370, 9.18090, 'Corso di Porta Ticinese 50, 20123 Milano, Italy'),
    (9,  45.48400, 9.21800, 'Viale Monza 15, 20127 Milano, Italy'),
    (10, 45.45700, 9.15600, 'Via Washington 70, 20146 Milano, Italy'),
    (11, 45.48390, 9.19000, 'Piazza Gae Aulenti 1, 20124 Milano, Italy'),
    (12, 45.48100, 9.17800, 'Via Paolo Sarpi 20, 20154 Milano, Italy'),
    (13, 45.48000, 9.18300, 'Corso Garibaldi 71, 20121 Milano, Italy'),
    (14, 45.45100, 9.17400, 'Via Vigevano 30, 20144 Milano, Italy'),
    (15, 45.48600, 9.21300, 'Piazzale Loreto, 20127 Milano, Italy'),
    (16, 45.48500, 9.19600, 'Via Melchiorre Gioia 40, 20124 Milano, Italy'),
    (17, 45.48600, 9.20500, 'Piazza Duca d''Aosta 1, 20124 Milano, Italy'),
    (18, 45.45000, 9.15500, 'Via Solari 40, 20144 Milano, Italy'),
    (19, 45.48000, 9.17000, 'Corso Sempione 30, 20154 Milano, Italy'),
    (20, 45.45200, 9.16000, 'Via Tortona 27, 20144 Milano, Italy')
),
todo as (
  select id, row_number() over (order by id) as rn
  from public.cars
  where lat is null and lng is null and city = 'Milan'
)
update public.cars c
set lat = s.lat, lng = s.lng, address_label = s.label, location = s.label
from todo t
join spots s on s.n = ((t.rn - 1) % 20) + 1
where c.id = t.id;
