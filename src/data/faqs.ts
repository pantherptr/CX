export const CATEGORIES = [
  'Before you book',
  'Booking & changes',
  'Pickup',
  'During your trip',
  'Returning & billing',
  'Account & hosting',
] as const;

export type Category = (typeof CATEGORIES)[number];

export const faqs: { q: string; a: string; category: Category }[] = [
  {
    category: 'Before you book',
    q: 'How does booking a car work?',
    a: 'Search by city and dates, choose a car, and either reserve instantly or send a request to the host. You\'ll see the full price — including service fee and protection — before you confirm anything.',
  },
  {
    category: 'Before you book',
    q: 'Is my trip insured?',
    a: 'Every booking includes a protection plan, priced as a percentage of your rental cost and shown as a separate line item at checkout — never hidden in the daily rate.',
  },
  {
    category: 'Before you book',
    q: 'What extras can I add to my trip?',
    a: 'At checkout you can add an additional driver or a child seat, each priced per day and shown as its own line in your total — nothing bundled in without you choosing it.',
  },
  {
    category: 'Before you book',
    q: 'What are the cancellation policies?',
    a: 'Every host chooses one policy for their car, and it is shown on the car page and at checkout before you pay. Flexible: full refund until 24 hours before pick-up. Moderate: full refund until 5 days before, 50% until 24 hours before. Strict: 50% refund until 7 days before pick-up. If a host cancels, you always get a full refund.',
  },
  {
    category: 'Booking & changes',
    q: 'What\'s the cancellation policy?',
    a: 'It depends on the policy your host chose, which you saw before paying. Open your trip, choose Cancel trip, and we show exactly how much you will be refunded before you confirm. The refund goes back to the card you paid with automatically; your bank decides how long it takes to appear.',
  },
  {
    category: 'Booking & changes',
    q: 'Can I change my trip dates after booking?',
    a: 'Yes — from Trip Details, use "Modify dates" any time before your trip starts. We re-check the car\'s availability for your new dates and recalculate the price before anything is confirmed.',
  },
  {
    category: 'Pickup',
    q: 'How do I coordinate pickup with my host?',
    a: 'Your Trip Details page shows the pickup location with a direct link to Maps, plus your host\'s typical response time. Message them directly from there to confirm exact timing.',
  },
  {
    category: 'During your trip',
    q: 'How do I contact my host or a renter?',
    a: 'Every booking opens a conversation in Messages, so you can coordinate pickup, ask questions, or share details without leaving CX.',
  },
  {
    category: 'Returning & billing',
    q: 'What happens when I return the car?',
    a: 'Once your return date passes, the trip automatically moves to Completed in My Trips — no action needed. Your itemised receipt (rental, fees, protection, any extras) stays available on Trip Details.',
  },
  {
    category: 'Account & hosting',
    q: 'How do I become a host?',
    a: 'Tap "List your car" from the menu, walk through the guided listing flow (vehicle details, photos, pricing, availability) and publish. Your car becomes visible to renters immediately.',
  },
  {
    category: 'Account & hosting',
    q: 'How and when do hosts get paid?',
    a: 'Payouts are tied to each completed trip. Hosts can review earnings and payout history from the Host Dashboard.',
  },
];
