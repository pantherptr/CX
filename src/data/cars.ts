import type { Car, Review } from './types';

/* Shared, brand-agnostic detail shots reused across galleries
   (interior, headlight, tail-light, EV charging). */
const INT = 'photo-1449965408869-eaa3f722e40d';
const DETAIL_A = 'photo-1542282088-fe8426682b8f';
const DETAIL_B = 'photo-1493238792000-8113da705763';
const DETAIL_C = 'photo-1554744512-d6c603f27c54';
const EVCHARGE = 'photo-1593941707882-a5bba14938c7';

const gallery = (hero: string, ev: boolean): string[] =>
  ev
    ? [hero, INT, EVCHARGE, DETAIL_A, DETAIL_B]
    : [hero, INT, DETAIL_A, DETAIL_B, DETAIL_C];

const R = (
  id: string,
  author: string,
  n: number,
  location: string,
  rating: number,
  date: string,
  body: string,
): Review => ({
  id, author, avatar: `https://i.pravatar.cc/120?img=${n}`, location, rating, date, body,
});

const reviewPool: Review[] = [
  R('rv1', 'Elena R.', 5, 'Milan, Italy', 5, 'March 2026', 'Spotless car, seamless handover and the host even left a note with favourite driving roads. Would rent again in a heartbeat.'),
  R('rv2', 'Thomas K.', 15, 'Munich, Germany', 5, 'February 2026', 'Exactly as pictured. Powerful, comfortable and immaculately maintained. Communication was instant.'),
  R('rv3', 'Chloé M.', 25, 'Paris, France', 4.8, 'February 2026', 'Beautiful car and a smooth trip along the coast. Pickup took a few minutes longer than expected but otherwise flawless.'),
  R('rv4', 'Marco B.', 35, 'Rome, Italy', 5, 'January 2026', 'Five stars. The car turned heads everywhere and drove like a dream. Host was flexible with my late return.'),
  R('rv5', 'Anna S.', 41, 'Amsterdam, NL', 5, 'January 2026', 'Clean, quiet and a joy to drive through the city. Everything was effortless from booking to drop-off.'),
  R('rv6', 'Javier L.', 51, 'Barcelona, Spain', 4.9, 'December 2025', 'Great value for such a premium vehicle. Everything worked perfectly and the host was a pleasure to deal with.'),
];

const pick = (offset: number, count: number): Review[] =>
  Array.from({ length: count }, (_, i) => {
    const base = reviewPool[(offset + i) % reviewPool.length];
    return { ...base, id: `${base.id}-${offset}-${i}` };
  });

interface Seed {
  make: string; model: string; trim?: string; year: number;
  category: Car['category']; city: string; location: string; price: number;
  rating: number; trips: number; instant: boolean;
  transmission: Car['transmission']; fuel: Car['fuel'];
  seats: number; doors: number; mileage: string; drive: string;
  hostId: string; hero: string; features: string[]; description: string;
}

const ev = (f: Car['fuel']) => f === 'Electric';

const seeds: Seed[] = [
  {
    make: 'BMW', model: 'M4', trim: 'Competition', year: 2024, category: 'Sport',
    city: 'Milan', location: 'Brera, Milan', price: 145, rating: 4.97, trips: 128, instant: true,
    transmission: 'Automatic', fuel: 'Petrol', seats: 4, doors: 2, mileage: '300 km / day', drive: 'Rear-wheel drive',
    hostId: 'michael', hero: 'photo-1580273916550-e323be2ae537',
    features: ['Apple CarPlay', 'Bluetooth', 'Heated seats', 'Parking sensors', 'Adaptive cruise control', 'Premium sound', 'Navigation', 'Carbon interior'],
    description: 'A 510-hp twin-turbo coupé that turns an ordinary drive into an event. Immaculately kept, fully serviced and detailed before every trip. Ideal for a weekend in the Alps or a night out in the city — this M4 delivers the presence and precision that only Munich engineering can.',
  },
  {
    make: 'Tesla', model: 'Model 3', trim: 'Long Range', year: 2024, category: 'Electric',
    city: 'Amsterdam', location: 'De Pijp, Amsterdam', price: 72, rating: 4.9, trips: 302, instant: true,
    transmission: 'Automatic', fuel: 'Electric', seats: 5, doors: 4, mileage: 'Unlimited', drive: 'All-wheel drive',
    hostId: 'daniel', hero: 'photo-1560958089-b8a1929cea89',
    features: ['Autopilot', 'Apple CarPlay', 'Bluetooth', 'Heated seats', 'Premium sound', 'Navigation', 'Glass roof'],
    description: 'Silent, quick and effortlessly efficient. Over 500 km of range, a minimalist cabin and access to the Supercharger network make this the easy choice for city and country alike.',
  },
  {
    make: 'Mercedes-AMG', model: 'GT', trim: 'Coupé', year: 2023, category: 'Sport',
    city: 'Milan', location: 'CityLife, Milan', price: 189, rating: 4.96, trips: 71, instant: false,
    transmission: 'Automatic', fuel: 'Petrol', seats: 2, doors: 2, mileage: '250 km / day', drive: 'Rear-wheel drive',
    hostId: 'michael', hero: 'photo-1616788494707-ec28f08d05a1',
    features: ['Apple CarPlay', 'Bluetooth', 'Heated seats', 'Sport exhaust', 'Burmester sound', 'Navigation', 'Carbon interior'],
    description: 'A hand-built front-mid-engine grand tourer with a soundtrack to match its silhouette. Dramatic, fast and surprisingly usable — the AMG GT is a genuine occasion every time you turn the key.',
  },
  {
    make: 'Porsche', model: '718 Cayman', trim: 'S', year: 2024, category: 'Sport',
    city: 'Florence', location: 'Oltrarno, Florence', price: 159, rating: 4.95, trips: 96, instant: false,
    transmission: 'Automatic', fuel: 'Petrol', seats: 2, doors: 2, mileage: '250 km / day', drive: 'Rear-wheel drive',
    hostId: 'giulia', hero: 'photo-1592853625597-7d17be820d0c',
    features: ['Apple CarPlay', 'Bluetooth', 'Heated seats', 'Sport Chrono', 'Premium sound', 'Navigation', 'Sport exhaust'],
    description: 'The perfectly balanced mid-engine sports car. Endlessly capable and immensely fun through the Tuscan hills, with the everyday manners to make it easy to live with for a weekend.',
  },
  {
    make: 'Mercedes-Benz', model: 'G 400 d', year: 2023, category: 'SUV',
    city: 'Munich', location: 'Bogenhausen, Munich', price: 175, rating: 4.93, trips: 84, instant: false,
    transmission: 'Automatic', fuel: 'Diesel', seats: 5, doors: 5, mileage: '300 km / day', drive: 'All-wheel drive',
    hostId: 'lukas', hero: 'photo-1520031441872-265e4ff70366',
    features: ['Apple CarPlay', 'Bluetooth', 'Heated & cooled seats', 'Adaptive cruise control', 'Burmester sound', 'Ambient lighting', 'Navigation'],
    description: 'An icon. Unmistakable presence, a beautifully trimmed cabin and genuine go-anywhere capability. The G-Class turns every trip — school run or ski weekend — into a statement.',
  },
  {
    make: 'Audi', model: 'RS6 Avant', year: 2023, category: 'Sport',
    city: 'Munich', location: 'Schwabing, Munich', price: 135, rating: 4.92, trips: 74, instant: true,
    transmission: 'Automatic', fuel: 'Petrol', seats: 5, doors: 5, mileage: '300 km / day', drive: 'All-wheel drive',
    hostId: 'lukas', hero: 'photo-1606664515524-ed2f786a0bd6',
    features: ['Apple CarPlay', 'Bluetooth', 'Heated seats', 'Parking sensors', 'Adaptive cruise control', 'Bang & Olufsen sound', 'Navigation'],
    description: 'The ultimate do-everything car — supercar pace, estate practicality and quattro traction in any weather. Load the family and the luggage, then embarrass sports cars on the autobahn.',
  },
  {
    make: 'Fiat', model: '500', trim: 'Dolcevita', year: 2023, category: 'Economy',
    city: 'Rome', location: 'Trastevere, Rome', price: 39, rating: 4.85, trips: 421, instant: true,
    transmission: 'Manual', fuel: 'Petrol', seats: 4, doors: 3, mileage: 'Unlimited', drive: 'Front-wheel drive',
    hostId: 'sofia', hero: 'photo-1549317661-bd32c8ce0db2',
    features: ['Apple CarPlay', 'Bluetooth', 'Panoramic roof', 'Navigation'],
    description: 'The most Roman way to see Rome. Tiny, charming and effortless to park on the narrowest of streets — a little dose of la dolce vita for your city break.',
  },
  {
    make: 'Tesla', model: 'Model S', trim: 'Plaid', year: 2024, category: 'Electric',
    city: 'Paris', location: '8th Arr., Paris', price: 149, rating: 4.94, trips: 118, instant: false,
    transmission: 'Automatic', fuel: 'Electric', seats: 5, doors: 4, mileage: 'Unlimited', drive: 'All-wheel drive',
    hostId: 'sofia', hero: 'photo-1536700503339-1e4b06520771',
    features: ['Autopilot', 'Apple CarPlay', 'Bluetooth', 'Heated & cooled seats', 'Premium sound', 'Navigation', 'Glass roof', 'Rear entertainment'],
    description: 'Face-bending acceleration wrapped in a serene, minimalist luxury saloon. Over 600 km of range and the most advanced tech on the road — arrive anywhere in Paris in complete silence.',
  },
  {
    make: 'Chevrolet', model: 'Camaro', trim: 'SS', year: 2023, category: 'Sport',
    city: 'Barcelona', location: 'Eixample, Barcelona', price: 98, rating: 4.87, trips: 133, instant: true,
    transmission: 'Automatic', fuel: 'Petrol', seats: 4, doors: 2, mileage: '300 km / day', drive: 'Rear-wheel drive',
    hostId: 'sofia', hero: 'photo-1552519507-da3b142c6e3d',
    features: ['Apple CarPlay', 'Bluetooth', 'Heated seats', 'Sport exhaust', 'Premium sound', 'Navigation'],
    description: 'American muscle with a naturally aspirated V8 and a soundtrack to match. Dramatic looks, huge grip and endless fun for a coastal road trip along the Costa Brava.',
  },
  {
    make: 'Lamborghini', model: 'Huracán', trim: 'EVO', year: 2023, category: 'Luxury',
    city: 'Milan', location: 'Quadrilatero, Milan', price: 749, rating: 4.99, trips: 38, instant: false,
    transmission: 'Automatic', fuel: 'Petrol', seats: 2, doors: 2, mileage: '200 km / day', drive: 'All-wheel drive',
    hostId: 'michael', hero: 'photo-1544829099-b9a0c07fad1a',
    features: ['Apple CarPlay', 'Bluetooth', 'Carbon interior', 'Sport exhaust', 'Premium sound', 'Navigation', 'Lifting system'],
    description: 'A naturally aspirated V10 supercar and a true bucket-list drive. Theatrical, savage and unforgettable — reserved for those special occasions that deserve nothing less.',
  },
  {
    make: 'Audi', model: 'A7', trim: 'Sportback', year: 2024, category: 'Luxury',
    city: 'Munich', location: 'Lehel, Munich', price: 119, rating: 4.91, trips: 97, instant: true,
    transmission: 'Automatic', fuel: 'Hybrid', seats: 5, doors: 5, mileage: '350 km / day', drive: 'All-wheel drive',
    hostId: 'lukas', hero: 'photo-1606152421802-db97b9c7a11b',
    features: ['Apple CarPlay', 'Bluetooth', 'Heated & cooled seats', 'Adaptive cruise control', 'Bang & Olufsen sound', 'Ambient lighting', 'Navigation'],
    description: 'A sleek executive fastback that blends first-class comfort with genuine road presence. The refined choice for business travel and long, effortless motorway miles.',
  },
  {
    make: 'Ford', model: 'Explorer', trim: 'ST', year: 2023, category: 'Family',
    city: 'Rome', location: 'Parioli, Rome', price: 89, rating: 4.86, trips: 156, instant: true,
    transmission: 'Automatic', fuel: 'Petrol', seats: 7, doors: 5, mileage: '350 km / day', drive: 'All-wheel drive',
    hostId: 'sofia', hero: 'photo-1606611013016-969c19ba27bb',
    features: ['Apple CarPlay', 'Bluetooth', 'Heated seats', 'Parking sensors', 'Adaptive cruise control', 'Premium sound', 'Navigation'],
    description: 'Seven full seats and a huge boot make this the ideal base camp for a family holiday. Comfortable, capable and easy to drive despite its generous size.',
  },
  {
    make: 'Lamborghini', model: 'Huracán', trim: 'EVO Spyder', year: 2023, category: 'Convertible',
    city: 'Barcelona', location: 'Diagonal Mar, Barcelona', price: 799, rating: 4.98, trips: 29, instant: false,
    transmission: 'Automatic', fuel: 'Petrol', seats: 2, doors: 2, mileage: '200 km / day', drive: 'All-wheel drive',
    hostId: 'sofia', hero: 'photo-1580414057403-c5f451f30e1c',
    features: ['Apple CarPlay', 'Bluetooth', 'Carbon interior', 'Sport exhaust', 'Neck-level heating', 'Premium sound', 'Navigation'],
    description: 'All the drama of the Huracán, now open to the sky. Drop the roof, fire up the V10 and take the coast road — there is simply no better way to arrive.',
  },
  {
    make: 'Volkswagen', model: 'Polo', trim: 'Style', year: 2024, category: 'Economy',
    city: 'Amsterdam', location: 'Jordaan, Amsterdam', price: 44, rating: 4.84, trips: 268, instant: true,
    transmission: 'Automatic', fuel: 'Petrol', seats: 5, doors: 5, mileage: 'Unlimited', drive: 'Front-wheel drive',
    hostId: 'daniel', hero: 'photo-1541899481282-d53bffe3c35d',
    features: ['Apple CarPlay', 'Bluetooth', 'Heated seats', 'Parking sensors', 'Adaptive cruise control', 'Navigation'],
    description: 'Sensible, solid and comfortable — the benchmark small car. All the space you need for a city break, with none of the fuss and effortless fuel economy.',
  },
  {
    make: 'Ford', model: 'Mustang', trim: 'GT', year: 2023, category: 'Sport',
    city: 'Milan', location: 'Navigli, Milan', price: 105, rating: 4.88, trips: 112, instant: true,
    transmission: 'Manual', fuel: 'Petrol', seats: 4, doors: 2, mileage: '300 km / day', drive: 'Rear-wheel drive',
    hostId: 'michael', hero: 'photo-1494905998402-395d579af36f',
    features: ['Apple CarPlay', 'Bluetooth', 'Heated seats', 'Sport exhaust', 'Premium sound', 'Navigation'],
    description: 'A 5.0-litre V8 pony car with real character and a glorious manual gearbox. Loud, proud and endlessly charismatic — the ultimate accessory for a summer road trip.',
  },
  {
    make: 'Toyota', model: 'RAV4', trim: 'Hybrid', year: 2024, category: 'SUV',
    city: 'Florence', location: 'Campo di Marte, Florence', price: 78, rating: 4.87, trips: 189, instant: true,
    transmission: 'Automatic', fuel: 'Hybrid', seats: 5, doors: 5, mileage: 'Unlimited', drive: 'All-wheel drive',
    hostId: 'giulia', hero: 'photo-1617469767053-d3b523a0b982',
    features: ['Apple CarPlay', 'Bluetooth', 'Heated seats', 'Parking sensors', 'Adaptive cruise control', 'Navigation'],
    description: 'The dependable, economical all-rounder. Roomy, hybrid-efficient and comfortable on any surface — a stress-free choice for exploring Tuscany with the whole family.',
  },
];

export const cars: Car[] = seeds.map((s, i) => {
  const slug = `${s.make}-${s.model}${s.trim ? '-' + s.trim : ''}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return {
    id: `car-${i + 1}`,
    slug,
    make: s.make, model: s.model, trim: s.trim, year: s.year,
    category: s.category, location: s.location, city: s.city,
    pricePerDay: s.price, rating: s.rating, trips: s.trips, instantBook: s.instant,
    transmission: s.transmission, fuel: s.fuel, seats: s.seats, doors: s.doors,
    mileage: s.mileage, drive: s.drive,
    images: gallery(s.hero, ev(s.fuel)),
    features: s.features, description: s.description, hostId: s.hostId,
    reviews: pick(i, 4),
  };
});

export const carById = (id: string) => cars.find((c) => c.id === id);
export const carBySlug = (slug: string) => cars.find((c) => c.slug === slug);

export const featuredCars = cars.slice(0, 8);
