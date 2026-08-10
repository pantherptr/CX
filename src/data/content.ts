import type {
  Category,
  Testimonial,
  Trip,
  HostBooking,
  Conversation,
} from './types';
import { avatar } from '../lib/img';

export const categories: Category[] = [
  { name: 'Economy', tagline: 'Smart & efficient', count: 214, icon: 'leaf', image: 'photo-1549317661-bd32c8ce0db2' },
  { name: 'Luxury', tagline: 'Arrive in style', count: 96, icon: 'gem', image: 'photo-1544829099-b9a0c07fad1a' },
  { name: 'SUV', tagline: 'Space for everything', count: 178, icon: 'mountain', image: 'photo-1520031441872-265e4ff70366' },
  { name: 'Sport', tagline: 'Pure performance', count: 64, icon: 'flame', image: 'photo-1616788494707-ec28f08d05a1' },
  { name: 'Electric', tagline: 'Silent & clean', count: 132, icon: 'bolt', image: 'photo-1560958089-b8a1929cea89' },
  { name: 'Convertible', tagline: 'Top-down freedom', count: 41, icon: 'sun', image: 'photo-1580414057403-c5f451f30e1c' },
  { name: 'Family', tagline: 'Room for everyone', count: 153, icon: 'users', image: 'photo-1606611013016-969c19ba27bb' },
];

export const testimonials: Testimonial[] = [
  {
    id: 't1',
    name: 'Isabella Conti',
    location: 'Milan, Italy',
    avatar: avatar(20),
    rating: 5,
    body: 'Booked a Porsche for a weekend in the Dolomites and it was flawless from start to finish. The car was pristine and the host met me right at my hotel. Velora has completely replaced rental counters for me.',
  },
  {
    id: 't2',
    name: 'Julien Moreau',
    location: 'Paris, France',
    avatar: avatar(13),
    rating: 5,
    body: 'I list two cars on Velora and the extra income covers both leases. The app makes managing bookings and payouts genuinely effortless — I barely think about it.',
  },
  {
    id: 't3',
    name: 'Emma van Dijk',
    location: 'Amsterdam, NL',
    avatar: avatar(47),
    rating: 5,
    body: 'The whole experience feels premium. Verified cars, real reviews and prices that make sense. I rented a Tesla for a week and the pickup took under two minutes.',
  },
];

export const savedCarIds = ['car-1', 'car-9', 'car-14', 'car-5'];

export const customer = {
  name: 'Alex',
  fullName: 'Alex Rossi',
  email: 'alex.rossi@email.com',
  avatar: avatar(68),
  location: 'Milan, Italy',
  memberSince: '2023',
  license: 'IT · valid until 2029',
};

export const hostUser = {
  name: 'Michael',
  fullName: 'Michael Ferraro',
  email: 'michael.ferraro@email.com',
  avatar: avatar(12),
  location: 'Milan, Italy',
};

export const trips: Trip[] = [
  { id: 'tr1', carId: 'car-4', status: 'upcoming', start: '24 Aug 2026', end: '27 Aug 2026', location: 'Florence', total: 531, reference: 'VLR-8241' },
  { id: 'tr2', carId: 'car-1', status: 'completed', start: '02 Jul 2026', end: '05 Jul 2026', location: 'Milan', total: 519, reference: 'VLR-7714' },
  { id: 'tr3', carId: 'car-2', status: 'completed', start: '14 Jun 2026', end: '18 Jun 2026', location: 'Amsterdam', total: 356, reference: 'VLR-7402' },
  { id: 'tr4', carId: 'car-9', status: 'completed', start: '28 Apr 2026', end: '01 May 2026', location: 'Barcelona', total: 428, reference: 'VLR-6980' },
];

export const customerStats = {
  upcoming: 1,
  completed: 12,
  saved: 4,
  spent: 4820,
};

export const hostStats = {
  totalEarnings: 41280,
  thisMonth: 3940,
  activeCars: 4,
  upcoming: 6,
  rating: 4.96,
};

export const hostBookings: HostBooking[] = [
  { id: 'hb1', guest: 'Elena Rossi', guestAvatar: avatar(5), carId: 'car-1', start: '24 Aug', end: '27 Aug', status: 'confirmed', payout: 392 },
  { id: 'hb2', guest: 'Thomas Klein', guestAvatar: avatar(15), carId: 'car-3', start: '25 Aug', end: '29 Aug', status: 'confirmed', payout: 612 },
  { id: 'hb3', guest: 'Chloé Martin', guestAvatar: avatar(25), carId: 'car-15', start: '30 Aug', end: '02 Sep', status: 'pending', payout: 284 },
  { id: 'hb4', guest: 'Marco Bianchi', guestAvatar: avatar(35), carId: 'car-10', start: '01 Sep', end: '04 Sep', status: 'confirmed', payout: 2022 },
  { id: 'hb5', guest: 'Anna Schmidt', guestAvatar: avatar(41), carId: 'car-1', start: '06 Sep', end: '08 Sep', status: 'pending', payout: 261 },
];

// Monthly earnings for the host chart (Jan–Aug).
export const earnings = [
  { month: 'Jan', value: 2810 },
  { month: 'Feb', value: 3120 },
  { month: 'Mar', value: 2960 },
  { month: 'Apr', value: 3680 },
  { month: 'May', value: 4210 },
  { month: 'Jun', value: 5030 },
  { month: 'Jul', value: 4640 },
  { month: 'Aug', value: 3940 },
];

export const conversations: Conversation[] = [
  {
    id: 'c1',
    name: 'Michael Ferraro',
    avatar: avatar(12),
    carLabel: 'BMW M4 Competition',
    lastTime: '10:24',
    unread: 0,
    online: true,
    messages: [
      { id: 'm1', from: 'me', body: 'Hi Michael, is the car available for airport pickup?', time: '10:18', read: true },
      { id: 'm2', from: 'them', body: 'Absolutely. I can meet you at Terminal 1.', time: '10:20' },
      { id: 'm3', from: 'them', body: 'Just send me your flight number the day before and I’ll track the arrival.', time: '10:20' },
      { id: 'm4', from: 'me', body: 'Perfect — it’s AZ204, landing around 14:30.', time: '10:22', read: true },
      { id: 'm5', from: 'them', body: 'Got it. I’ll be in arrivals with the keys. Safe travels!', time: '10:24' },
    ],
  },
  {
    id: 'c2',
    name: 'Giulia Bianchi',
    avatar: avatar(45),
    carLabel: 'Porsche 718 Cayman',
    lastTime: 'Yesterday',
    unread: 2,
    online: false,
    messages: [
      { id: 'm1', from: 'them', body: 'Hi Alex! Looking forward to your trip this weekend 🚗', time: 'Yesterday 16:40' },
      { id: 'm2', from: 'them', body: 'Let me know if you’d like any recommendations for the Chianti route.', time: 'Yesterday 16:41' },
    ],
  },
  {
    id: 'c3',
    name: 'Daniel Vos',
    avatar: avatar(52),
    carLabel: 'Tesla Model 3',
    lastTime: 'Mon',
    unread: 0,
    online: true,
    messages: [
      { id: 'm1', from: 'me', body: 'Thanks again, the car was spotless!', time: 'Mon 09:12', read: true },
      { id: 'm2', from: 'them', body: 'Anytime Alex — you’re welcome back any time. ⭐️', time: 'Mon 09:30' },
    ],
  },
  {
    id: 'c4',
    name: 'Sofia Marchetti',
    avatar: avatar(24),
    carLabel: 'Tesla Model S Plaid',
    lastTime: 'Sun',
    unread: 0,
    online: false,
    messages: [
      { id: 'm1', from: 'them', body: 'Your booking is confirmed. Pickup details are in your trips.', time: 'Sun 12:00' },
      { id: 'm2', from: 'me', body: 'Wonderful, thank you Sofia!', time: 'Sun 12:15', read: true },
    ],
  },
];
