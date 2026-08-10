/** Build a responsive Unsplash URL from a stored photo id. */
export const unsplash = (id: string, w = 1200, h?: number) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&q=80&w=${w}${
    h ? `&h=${h}` : ''
  }`;

/** Deterministic avatar for demo people. */
export const avatar = (n: number) => `https://i.pravatar.cc/160?img=${n}`;
