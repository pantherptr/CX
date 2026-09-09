/**
 * Hand-authored side-profile silhouettes for the Empire game's vehicle
 * catalog — one distinct body shape per `silhouette` key (see
 * game_vehicle_templates.silhouette in the migration), never a single
 * shape recolored per rarity. Rarity only changes the paint color and
 * the glow beneath the car; the shape itself is what makes a Hatchback
 * read as nothing like a Hypercar.
 */

const BODY_PATHS: Record<string, string> = {
  hatchback: 'M18,58 L26,40 Q34,30 50,30 L100,30 Q112,30 118,40 L134,44 L176,50 Q182,52 182,58 L182,64 L18,64 Z',
  sedan: 'M12,58 L22,42 Q30,32 46,32 L92,32 Q102,32 108,40 L118,44 L150,46 Q158,46 162,52 L188,56 Q192,58 192,62 L192,66 L12,66 Z',
  suv: 'M14,54 L20,32 Q24,24 36,24 L112,24 Q124,24 130,32 L138,38 L178,42 Q186,44 186,52 L186,64 L14,64 Z',
  coupe: 'M16,58 L30,44 Q42,30 62,30 L108,30 Q124,30 132,42 L150,46 L182,52 Q186,54 186,58 L186,64 L16,64 Z',
  sports: 'M10,60 L28,50 Q40,34 64,32 L120,32 Q136,32 144,44 L196,52 Q200,54 200,58 L200,66 L10,66 Z',
  convertible: 'M14,58 L30,44 Q40,36 58,36 L104,36 Q116,36 124,44 L188,52 Q194,54 194,58 L194,66 L14,66 Z M56,36 L56,44 M120,36 L120,44',
  offroad: 'M12,50 L18,26 Q22,18 34,18 L114,18 Q126,18 132,26 L142,34 L182,38 Q190,40 190,50 L190,64 L12,64 Z',
  hypercar: 'M8,62 L34,52 Q52,30 80,28 L128,28 Q148,30 158,42 L206,50 Q212,52 212,58 L212,68 L8,68 Z M158,42 L172,30 L182,42',
  limousine: 'M10,58 L20,42 Q28,32 44,32 L80,32 Q90,32 96,40 L104,44 L142,44 Q150,44 154,50 L188,52 L226,56 Q232,58 232,62 L232,66 L10,66 Z',
  'hypercar-wing': 'M6,64 L32,54 Q50,32 78,30 L130,30 Q152,32 162,44 L212,52 Q218,54 218,60 L218,70 L6,70 Z M200,50 L200,36 L220,36 L220,48 Z',
  concept: 'M10,60 L36,46 Q56,26 90,24 L134,24 Q158,26 168,40 L206,50 Q212,52 212,58 L212,68 L10,68 Z M90,24 L104,40 L134,40 L134,24',
};

const WHEEL_LAYOUT: Record<string, [number, number]> = {
  hatchback: [46, 156],
  sedan: [46, 166],
  suv: [44, 164],
  coupe: [48, 160],
  sports: [48, 176],
  convertible: [46, 172],
  offroad: [42, 168],
  hypercar: [50, 188],
  limousine: [46, 210],
  'hypercar-wing': [48, 196],
  concept: [50, 190],
};

const WHEEL_RADIUS: Record<string, number> = {
  suv: 15,
  offroad: 17,
  hypercar: 13,
  'hypercar-wing': 13,
  concept: 13,
  sports: 12,
};

export function CarSilhouette({
  silhouette,
  color,
  className,
}: {
  silhouette: string;
  color: string;
  className?: string;
}) {
  const body = BODY_PATHS[silhouette] ?? BODY_PATHS.sedan;
  const [wheelA, wheelB] = WHEEL_LAYOUT[silhouette] ?? WHEEL_LAYOUT.sedan;
  const wheelR = WHEEL_RADIUS[silhouette] ?? 13;

  return (
    <svg viewBox="0 0 240 90" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx={(wheelA + wheelB) / 2 + 10} cy="78" rx="90" ry="7" fill={color} opacity="0.14" />
      <path d={body} fill={color} fillOpacity="0.92" stroke="rgba(0,0,0,0.25)" strokeWidth="1" />
      <circle cx={wheelA} cy="66" r={wheelR} fill="#14161a" stroke="#3a3f47" strokeWidth="2" />
      <circle cx={wheelB} cy="66" r={wheelR} fill="#14161a" stroke="#3a3f47" strokeWidth="2" />
      <circle cx={wheelA} cy="66" r={wheelR * 0.4} fill="#3a3f47" />
      <circle cx={wheelB} cy="66" r={wheelR * 0.4} fill="#3a3f47" />
    </svg>
  );
}
