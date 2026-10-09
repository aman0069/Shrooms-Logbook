# Repository Guidelines

## Project Structure & Module Organization
The maintained Home Assistant add-on lives in `cordyceps_lab_console/`; root-level app files are the original scaffold. The active React/Vite UI in `cordyceps_lab_console/src/` submits activity records to the Express API in `server/`. Prisma stores daily batches, jars, 500 ml culture flasks and flask histories, activity logs, and sensor snapshots in SQLite (`prisma/`). QR scans resolve batch or jar tokens through the same API. Configured Home Assistant sensors are captured with each activity; failed browser submissions are queued in local storage for retry.

## Build, Test, and Development Commands
Run commands from `cordyceps_lab_console/`:

- `npm install` installs dependencies.
- `npm run dev` starts Vite on port 8099.
- `npm run server` starts the API with file watching; `npm run server:prod` starts it directly on port 3001.
- `npm run build` runs the TypeScript project build and creates the Vite production bundle.
- `npm run test:api` runs the API smoke test against a disposable SQLite database, including request validation and idempotency checks.
- `npm run db:generate`, `npm run db:push`, and `npm run db:migrate` generate Prisma Client, push the schema, and apply committed migrations, respectively.

## Coding Style & Naming Conventions
The active UI uses React with TypeScript and Tailwind CSS; server request bodies are validated with Zod. TypeScript strict mode is enabled in `tsconfig.app.json`. No repository linter or formatter configuration is present, so preserve the surrounding file style and keep generated output out of source changes.

## Testing Guidelines
The defined automated test is `npm run test:api`; run it from the active add-on directory. It starts a local API process and removes its temporary database afterward. `npm run build` is the available TypeScript and production-bundle check. No test framework or coverage threshold is configured.

## Commit & Pull Request Guidelines
Recent commit subjects use short imperative verbs, commonly `Fix`, `Improve`, `Align`, and `Release` (for example, “Fix form input contrast”). Follow that concise subject style. No pull request template was found in the repository.
