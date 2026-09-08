export type CarCategory =
  | 'Economy'
  | 'Luxury'
  | 'SUV'
  | 'Sport'
  | 'Electric'
  | 'Convertible'
  | 'Family';

export type Transmission = 'Automatic' | 'Manual';
export type Fuel = 'Petrol' | 'Diesel' | 'Electric' | 'Hybrid';

export interface Host {
  id: string;
  name: string;
  avatar: string;
  joined: string;
  rating: number;
  trips: number;
  responseTime: string;
  responseRate: number;
  verified: boolean;
  bio: string;
  isSuperhost: boolean;
}

export interface Review {
  id: string;
  author: string;
  avatar: string;
  location: string;
  rating: number;
  date: string;
  body: string;
}

export interface Car {
  id: string;
  slug: string;
  make: string;
  model: string;
  trim?: string;
  year: number;
  category: CarCategory;
  location: string;
  city: string;
  pricePerDay: number;
  rating: number;
  trips: number;
  instantBook: boolean;
  transmission: Transmission;
  fuel: Fuel;
  seats: number;
  doors: number;
  luggage: number;
  mileage: string;
  drive: string;
  images: string[];
  features: string[];
  description: string;
  hostId: string;
  reviews: Review[];
  /** Only populated for real Supabase-backed cars (host's own listings) — the mock seed data doesn't carry a lifecycle status.
   *  'suspended'/'removed' are Owner Control Center states (see supabase/migrations/0021_owner_control_center.sql); RLS already
   *  hides both from anyone but the car's own host and the Owner, same as 'draft'. */
  status?: 'draft' | 'published' | 'suspended' | 'removed';
  /** See supabase/migrations/0027_delivery_options.sql. Only populated
   *  for real Supabase-backed cars, same caveat as `status` above —
   *  code reading these treats a missing value as the DB default
   *  (pickup enabled, delivery not). A car must offer at least one of
   *  pickup/delivery (enforced by a DB constraint) — delivery-only
   *  listings are valid and real. deliveryFeeAmount is only meaningful
   *  when deliveryFeeType is 'fixed'; deliveryRadiusKm/deliveryInstructions/
   *  delivery hours are host-facing, informational only (this schema has
   *  no geocoding to enforce a radius against). */
  pickupEnabled?: boolean;
  deliveryEnabled?: boolean;
  deliveryFeeType?: 'free' | 'fixed';
  deliveryFeeAmount?: number;
  deliveryRadiusKm?: number | null;
  deliveryInstructions?: string;
  deliveryHoursStart?: string | null;
  deliveryHoursEnd?: string | null;
}

export interface Category {
  name: CarCategory;
  tagline: string;
  count: number;
  image: string;
  icon: string;
}

export interface Testimonial {
  id: string;
  name: string;
  location: string;
  avatar: string;
  rating: number;
  body: string;
}

export interface Trip {
  id: string;
  carId: string;
  status: 'upcoming' | 'completed' | 'cancelled';
  start: string;
  end: string;
  location: string;
  total: number;
  reference: string;
}

export interface ChatMessage {
  id: string;
  from: 'me' | 'them';
  body: string;
  time: string;
  read?: boolean;
}

export interface Conversation {
  id: string;
  name: string;
  avatar: string;
  carLabel: string;
  lastTime: string;
  unread: number;
  online: boolean;
  messages: ChatMessage[];
}
