import type { CSSProperties } from 'react';
import {
  Search, Calendar, MapPin, Star, Heart, ChevronDown, ChevronRight, ChevronLeft,
  ArrowRight, ArrowUpRight, Menu, X, Check, CheckCircle2, ShieldCheck, Users,
  Armchair, DoorOpen, Gauge, Fuel, Cog, Zap, Sun, Flame, Gem, Mountain, Leaf,
  Car, KeyRound, Wallet, LayoutGrid, Luggage, MessageSquare, Bell, Settings,
  User, LogOut, Plus, Minus, SlidersHorizontal, ArrowUpDown, Clock, Phone, Camera,
  Upload, CreditCard, Lock, Sparkles, Headset, Compass, TrendingUp, Euro,
  MessageSquareText, Send, Paperclip, BarChart3, CarFront, Route, Globe,
  Snowflake, Music, Apple, Info, BadgeCheck, Briefcase, Trophy, Gift, Pause,
  Play, Volume2, VolumeX, ShoppingBag, ShoppingCart, Truck, Package, Tag,
  type LucideIcon,
} from 'lucide-react';

export type IconName =
  | 'search' | 'calendar' | 'pin' | 'star' | 'heart' | 'chevronDown'
  | 'chevronRight' | 'chevronLeft' | 'arrowRight' | 'arrowUpRight' | 'menu'
  | 'x' | 'check' | 'checkCircle' | 'shield' | 'users' | 'seat' | 'door'
  | 'gauge' | 'gas' | 'gear' | 'bolt' | 'sun' | 'flame' | 'gem' | 'mountain'
  | 'leaf' | 'car' | 'key' | 'wallet' | 'grid' | 'trips' | 'message' | 'bell'
  | 'settings' | 'user' | 'logout' | 'plus' | 'sliders' | 'sort' | 'clock'
  | 'phone' | 'camera' | 'upload' | 'card' | 'lock' | 'sparkles' | 'headset'
  | 'compass' | 'trending' | 'euro' | 'reviews' | 'send' | 'paperclip'
  | 'chart' | 'cars' | 'route' | 'globe' | 'instant' | 'snowflake' | 'music'
  | 'twitter' | 'instagram' | 'linkedin' | 'apple' | 'info' | 'verified' | 'bag'
  | 'trophy' | 'gift' | 'pause' | 'play' | 'volume' | 'volumeOff'
  | 'minus' | 'shoppingBag' | 'cart' | 'truck' | 'package' | 'tag';

/**
 * Every icon in the product renders through the same Lucide set — one
 * stroke weight, one corner radius, one 24x24 grid — so nothing reads as
 * a mismatched, hand-drawn one-off next to the rest. `twitter` /
 * `instagram` / `linkedin` are the one exception: Lucide dropped brand
 * marks, so those three stay as small generic outline glyphs (not the
 * real logos) matching the same stroke language.
 */
const LUCIDE: Record<Exclude<IconName, 'twitter' | 'instagram' | 'linkedin'>, LucideIcon> = {
  search: Search, calendar: Calendar, pin: MapPin, star: Star, heart: Heart,
  chevronDown: ChevronDown, chevronRight: ChevronRight, chevronLeft: ChevronLeft,
  arrowRight: ArrowRight, arrowUpRight: ArrowUpRight, menu: Menu, x: X, check: Check,
  checkCircle: CheckCircle2, shield: ShieldCheck, users: Users, seat: Armchair,
  door: DoorOpen, gauge: Gauge, gas: Fuel, gear: Cog, bolt: Zap, sun: Sun,
  flame: Flame, gem: Gem, mountain: Mountain, leaf: Leaf, car: Car, key: KeyRound,
  wallet: Wallet, grid: LayoutGrid, trips: Luggage, message: MessageSquare, bell: Bell,
  settings: Settings, user: User, logout: LogOut, plus: Plus, sliders: SlidersHorizontal,
  sort: ArrowUpDown, clock: Clock, phone: Phone, camera: Camera, upload: Upload,
  card: CreditCard, lock: Lock, sparkles: Sparkles, headset: Headset, compass: Compass,
  trending: TrendingUp, euro: Euro, reviews: MessageSquareText, send: Send,
  paperclip: Paperclip, chart: BarChart3, cars: CarFront, route: Route, globe: Globe,
  instant: Zap, snowflake: Snowflake, music: Music, apple: Apple, info: Info,
  verified: BadgeCheck, bag: Briefcase, trophy: Trophy, gift: Gift, pause: Pause,
  play: Play, volume: Volume2, volumeOff: VolumeX, minus: Minus,
  shoppingBag: ShoppingBag, cart: ShoppingCart, truck: Truck, package: Package, tag: Tag,
};

const FILLED: IconName[] = ['star', 'heart', 'bolt', 'instant', 'flame', 'apple', 'play', 'pause'];

interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
  style?: CSSProperties;
  strokeWidth?: number;
  fill?: boolean;
}

export function Icon({ name, size = 20, className, style, strokeWidth = 1.8, fill }: IconProps) {
  const isFilled = fill ?? FILLED.includes(name);

  if (name === 'instagram' || name === 'linkedin' || name === 'twitter') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        style={style}
        aria-hidden="true"
      >
        {name === 'twitter' && <path d="M4 4l7 8.5M20 20l-7-8.5m0 0L4 20m9-8.5L20 4" />}
        {name === 'instagram' && (
          <>
            <rect x="4" y="4" width="16" height="16" rx="5" />
            <circle cx="12" cy="12" r="3.5" />
            <circle cx="17" cy="7" r="0.6" fill="currentColor" stroke="none" />
          </>
        )}
        {name === 'linkedin' && (
          <>
            <rect x="4" y="4" width="16" height="16" rx="3" />
            <path d="M8 10v7M8 7v.01M12 17v-4a2 2 0 0 1 4 0v4M12 17v-7" />
          </>
        )}
      </svg>
    );
  }

  const LucideComponent = LUCIDE[name];
  return (
    <LucideComponent
      size={size}
      strokeWidth={isFilled ? 0 : strokeWidth}
      fill={isFilled ? 'currentColor' : 'none'}
      className={className}
      style={style}
      aria-hidden="true"
    />
  );
}
