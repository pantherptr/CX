import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon, type IconName } from './Icon';

const cities = ['Milan', 'Rome', 'Florence', 'Paris', 'Barcelona', 'Munich', 'Amsterdam'];
const types = ['Any type', 'Economy', 'Luxury', 'SUV', 'Sport', 'Electric', 'Convertible', 'Family'];

function today(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

export function SearchBar({ variant = 'hero' }: { variant?: 'hero' | 'compact' }) {
  const navigate = useNavigate();
  const [location, setLocation] = useState('Milan');
  const [pickup, setPickup] = useState(today(3));
  const [ret, setRet] = useState(today(6));
  const [type, setType] = useState('Any type');

  const submit = () => {
    const params = new URLSearchParams();
    if (location) params.set('city', location);
    if (type !== 'Any type') params.set('type', type);
    navigate(`/browse?${params.toString()}`);
  };

  const Field = ({
    label,
    icon,
    children,
  }: {
    label: string;
    icon: IconName;
    children: ReactNode;
  }) => (
    <div className="group flex min-w-0 flex-1 items-center gap-3 px-4 py-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-panel text-muted transition-colors group-focus-within:bg-accent-050 group-focus-within:text-accent">
        <Icon name={icon} size={17} />
      </span>
      <label className="min-w-0 flex-1">
        <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted">
          {label}
        </span>
        {children}
      </label>
    </div>
  );

  const selectCls =
    'w-full appearance-none bg-transparent text-[15px] font-medium text-ink outline-none cursor-pointer -ml-0.5';
  const dateCls =
    'w-full bg-transparent text-[15px] font-medium text-ink outline-none cursor-pointer';

  return (
    <div
      className={`w-full ${
        variant === 'hero'
          ? 'rounded-[1.4rem] border border-line bg-surface p-2 shadow-lift'
          : 'rounded-2xl border border-line bg-surface p-1.5 shadow-soft'
      }`}
    >
      <div className="flex flex-col divide-y divide-line md:flex-row md:divide-x md:divide-y-0">
        <Field label="Location" icon="pin">
          <select value={location} onChange={(e) => setLocation(e.target.value)} className={selectCls}>
            {cities.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>

        <Field label="Pick-up" icon="calendar">
          <input type="date" value={pickup} min={today()} onChange={(e) => setPickup(e.target.value)} className={dateCls} />
        </Field>

        <Field label="Return" icon="calendar">
          <input type="date" value={ret} min={pickup} onChange={(e) => setRet(e.target.value)} className={dateCls} />
        </Field>

        <Field label="Car type" icon="car">
          <select value={type} onChange={(e) => setType(e.target.value)} className={selectCls}>
            {types.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Field>

        <div className="flex items-center p-2 md:pl-2">
          <button
            onClick={submit}
            className="btn btn-accent btn-block h-full min-h-[52px] gap-2 md:w-auto md:px-6"
          >
            <Icon name="search" size={18} strokeWidth={2} />
            <span className="md:hidden lg:inline">Search</span>
          </button>
        </div>
      </div>
    </div>
  );
}
