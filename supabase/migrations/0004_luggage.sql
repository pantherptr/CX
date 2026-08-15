-- Velora — luggage capacity spec (benchmark report item A1).
--
-- One-shot addition + backfill, same pattern as 0001–0003: the column is
-- added and every existing seeded car gets a real, category-appropriate
-- value in the same migration so there's never a null/zero flash in the UI.

alter table public.cars
  add column luggage int not null default 2;

update public.cars set luggage = 5 where slug = 'audi-rs6-avant';
update public.cars set luggage = 4 where slug = 'audi-a7-sportback';
update public.cars set luggage = 2 where slug = 'bmw-m4-competition';
update public.cars set luggage = 2 where slug = 'chevrolet-camaro-ss';
update public.cars set luggage = 2 where slug = 'fiat-500-dolcevita';
update public.cars set luggage = 5 where slug = 'ford-explorer-st';
update public.cars set luggage = 2 where slug = 'ford-mustang-gt';
update public.cars set luggage = 1 where slug = 'lamborghini-hurac-n-evo-spyder';
update public.cars set luggage = 2 where slug = 'lamborghini-hurac-n-evo';
update public.cars set luggage = 2 where slug = 'mercedes-amg-gt-coup';
update public.cars set luggage = 4 where slug = 'mercedes-benz-g-400-d';
update public.cars set luggage = 2 where slug = 'porsche-718-cayman-s';
update public.cars set luggage = 4 where slug = 'tesla-model-3-long-range';
update public.cars set luggage = 5 where slug = 'tesla-model-s-plaid';
update public.cars set luggage = 4 where slug = 'toyota-rav4-hybrid';
update public.cars set luggage = 3 where slug = 'volkswagen-polo-style';
