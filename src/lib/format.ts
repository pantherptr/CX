export const eur = (n: number) =>
  new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(n);

export const eur2 = (n: number) =>
  new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }).format(n);

/** e.g. 1240 -> "1.2k" */
export const compact = (n: number) =>
  new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n);

export const genRef = () =>
  'VLR-' + Math.floor(1000 + Math.random() * 9000);
