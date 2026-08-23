-- Adds the remaining "Build Your Drive" extras beyond the two 0005 already
-- seeded (additional_driver, child_seat): insurance, unlimited mileage,
-- car delivery, car collection, and the CX Drive Kit bundle.
--
-- No new logic — extras_catalog rows are picked up automatically by the
-- existing prepare_booking_extra()/apply_extra_to_booking_total() triggers
-- and by useExtrasCatalog() on the client, exactly like the first two.
-- Nothing in the frontend needs to change for these to appear in the
-- booking flow's Extras step once this migration runs.
--
-- Prices below are placeholders in the same ballpark as the existing two
-- (additional_driver €8/day, child_seat €6/day) — adjust to your actual
-- rates before applying. cx_drive_kit's €59 is not a placeholder: it's
-- the real CX Shop bundle price (see src/data/products.ts, b-drive-kit),
-- kept identical on purpose so the same bundle isn't priced two different
-- ways depending on where a customer buys it.
--
-- 'icon' values must be names already registered in src/components/Icon.tsx
-- (IconName) — the Extras step renders `extra.icon` directly as an Icon
-- name, so an unregistered value would fail to render there.

insert into public.extras_catalog (code, name, description, price, price_model, icon) values
  ('insurance', 'Premium insurance', 'Zero-excess cover on top of the protection already included with every trip.', 14, 'per_day', 'shield'),
  ('unlimited_mileage', 'Unlimited mileage', 'Drive as far as your trip takes you, with no distance cap.', 9, 'per_day', 'gauge'),
  ('car_delivery', 'Car delivery', 'Have the car delivered to an address of your choice for pick-up.', 25, 'flat', 'truck'),
  ('car_collection', 'Car collection', 'Have the car collected from an address of your choice at drop-off.', 25, 'flat', 'route'),
  ('cx_drive_kit', 'CX Drive Kit', 'Phone mount, USB-C charger, charging cable and air freshener — ready in the car at pick-up.', 59, 'flat', 'package');
