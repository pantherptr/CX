import type { CityEvent, District } from './data/districts';
import type { InventoryCar } from './data/empire';

export interface ActionableEvent {
  event: CityEvent;
  district: District;
}

/** A city event is actionable when its district is unlocked and the
 *  player owns a car matching its category (or it affects every
 *  category). Shared by EventDecisionBanner.tsx and LiveActionCenter.tsx
 *  so both agree on exactly the same eligibility rule. */
export function actionableCityEvents(
  events: CityEvent[],
  districts: District[],
  ownedCars: InventoryCar[],
  businessTier: number,
  dismissed: Set<string>
): ActionableEvent[] {
  return events
    .filter((e) => !dismissed.has(e.id))
    .map((event) => {
      const district = districts.find((d) => d.districtKey === event.districtKey);
      if (!district || businessTier < district.minBusinessTier) return null;
      const hasMatch = ownedCars.some((c) => event.category === null || c.category === event.category);
      if (!hasMatch) return null;
      return { event, district };
    })
    .filter((x): x is ActionableEvent => x !== null);
}
