# Velora — Setup on a new Mac

This is a finished front-end demo of a premium car-rental marketplace
(React + TypeScript + Vite + Tailwind). All data is mock — no backend, no real
payments. Use it as a reference or a starting point.

## Run it on your MacBook

You don't need to know these commands — just hand this folder to Claude Code and say:

> "This is a Vite + React + TypeScript project. Install what it needs and run it so
> I can see it in my browser."

If you'd rather do it yourself, in the Terminal (inside this folder):

```bash
npm install       # downloads the project's building blocks (one time)
npm run dev        # starts it — then open the http://localhost link it prints
npm run build      # makes the production version in dist/
```

You need **Node.js** installed first (Claude Code can install it for you, or get it
from nodejs.org — the LTS version).

## What's inside

- `src/pages/` — every screen (Home, Browse, Car details, Booking, dashboards, etc.)
- `src/components/` — reusable pieces (Navbar, CarCard, the car loader, etc.)
- `src/data/` — the mock cars, hosts, reviews and content
- `src/index.css` — the design system (colours, fonts, buttons, shadows)

## Deploying it live (Vercel)

Ask Claude Code:

> "Deploy this to Vercel and connect my GitHub account."

Because it's a Vite single-page app, the only setting Vercel needs is a redirect so
deep links work — Claude Code will handle that. No server or database required for
this demo; add those later if you build real features.
