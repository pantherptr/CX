-- Demo placement, other cities (continues 0141): cars with no exact spot in Florence, Barcelona, Rome, Munich and
-- Paris get a real street of their own city. Only cars with no spot are touched; any of them can be moved later
-- (Admin → Cars → "Move pin", or the host's own Manage car).

with spots(city, n, lat, lng, label) as (
  values
    ('Florence',  1, 43.77310, 11.25595, 'Piazza del Duomo, 50122 Firenze, Italy'),
    ('Florence',  2, 43.77080, 11.25140, 'Via de'' Tornabuoni 1, 50123 Firenze, Italy'),
    ('Barcelona', 1, 41.39220,  2.16400, 'Passeig de Gràcia 43, 08007 Barcelona, Spain'),
    ('Barcelona', 2, 41.38170,  2.17380, 'La Rambla 100, 08002 Barcelona, Spain'),
    ('Rome',      1, 41.89900, 12.47310, 'Piazza Navona 1, 00186 Roma, Italy'),
    ('Rome',      2, 41.90040, 12.47970, 'Via del Corso 100, 00186 Roma, Italy'),
    ('Munich',    1, 48.13740, 11.57550, 'Marienplatz 1, 80331 München, Germany'),
    ('Munich',    2, 48.13890, 11.58170, 'Maximilianstraße 17, 80539 München, Germany'),
    ('Munich',    3, 48.15750, 11.58390, 'Leopoldstraße 50, 80802 München, Germany'),
    ('Paris',     1, 48.87070,  2.30520, 'Avenue des Champs-Élysées 100, 75008 Paris, France')
),
todo as (
  select id, city, row_number() over (partition by city order by id) as rn
  from public.cars
  where lat is null and lng is null
)
update public.cars c
set lat = s.lat, lng = s.lng, address_label = s.label, location = s.label
from todo t
join spots s on s.city = t.city and s.n = ((t.rn - 1) % (select count(*) from spots x where x.city = t.city)) + 1
where c.id = t.id;
