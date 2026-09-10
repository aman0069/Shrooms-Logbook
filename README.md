# Cordyceps Lab Console

A local-first cultivation dashboard for managing Cordyceps militaris lab operations. This project tracks production batches, jar staging, contamination events, and rapid lab activity updates from a single console.

This app is designed as a Home Assistant add-on and is organized around the cultivation lifecycle:
- batch creation and strain tracking
- jar-level stage progression
- dark room / light room transitions
- contamination monitoring and incident logging
- activity feed for recent operational events

## What the app does

The current UI is a lab control panel for a mushroom cultivation workflow. It presents:
- total jars and active batch counts
- per-batch progress and current stage
- stage summaries across the workflow
- quick-entry controls for contamination counts, autoclave cycles, and room shifts
- live operational activity updates

The backend exposes lab data through an Express API, and persistence is handled by Prisma with SQLite.

## Tech stack
- React + Vite + TypeScript
- Tailwind CSS
- Framer Motion for UI motion
- Express API for serving frontend and lab data
- Prisma ORM with SQLite
- Home Assistant add-on packaging via `config.yaml`

## Project structure
- `src/` — React frontend dashboard
- `server/` — Express API and static asset serving
- `prisma/` — Prisma schema and database models
- `config.yaml` — Home Assistant add-on metadata
- `Dockerfile` — container build for deployment

## Local development

Install dependencies:

```bash
npm install
```

Start the frontend dev server:

```bash
npm run dev
```

Start the API server:

```bash
npm run server
```

Build the production bundle:

```bash
npm run build
```

## Database setup

Generate Prisma client:

```bash
npm run db:generate
```

Push the schema to SQLite:

```bash
npm run db:push
```

Open Prisma Studio:

```bash
npm run db:studio
```

## Data model

The database tracks cultivation data with these core entities:
- `Batch` — strain, stage, creation date, logs, events
- `Jar` — jar code, associated batch, stage, movement timestamps
- `ActivityLog` — operational events and timing details
- `ContaminationEvent` — contamination counts and notes

This matches the dashboard behavior used in the app for real lab operations.

## Home Assistant add-on notes

This app is intended to run as a Home Assistant add-on panel:

- Add this repository in Home Assistant under Settings → Add-ons → Add-on store → Repositories.
- Install the add-on named `Cordyceps Lab Console`.
- Start it and open it from the Home Assistant sidebar.
- The panel is configured with:
  - title: `Cordyceps Lab`
  - icon: `mdi:flask`
  - ingress enabled on port `3001`

The application listens on port `3001` and serves the dashboard through Home Assistant ingress.

## Notes

This project is not a generic starter app or a placeholder repository. It is a practical lab operations dashboard for local cultivation management and is intended to reflect the actual Cordyceps workflow represented in the UI and database schema.
