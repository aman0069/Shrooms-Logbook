# AI Sync Document

## Project Overview
This project is a local-first, purpose-built lab management application for Cordyceps militaris cultivation. It runs as a standalone Dockerized web app and is intended for deployment inside Home Assistant OS as a custom add-on using HA Ingress.

## Current Tech Stack
- Frontend: React + Vite + TypeScript
- Styling: Tailwind CSS, with a cyberpunk/dark-mode UI direction
- Motion: Framer Motion for micro-interactions
- Backend: Node.js + Express-ready structure (can be upgraded to Next.js API routes if needed)
- Database: SQLite with Prisma ORM
- Deployment: Dockerfile, config.yaml, and run.sh for HA add-on packaging
- Target environment: Home Assistant OS / HA Ingress / local-only lab usage

## Database Schema (Prisma)
```prisma
model Batch {
  id                 String   @id @default(cuid())
  batchCode          String   @unique
  strain             String
  dateCreated        DateTime @default(now())
  currentStage       String
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  jars              Jar[]
  activityLogs      ActivityLog[]
  contaminationEvents ContaminationEvent[]
}

model Jar {
  id                 String   @id @default(cuid())
  jarCode            String   @unique
  batchId            String
  batch              Batch    @relation(fields: [batchId], references: [id])
  currentStage       String
  createdAt          DateTime @default(now())
  movedAt            DateTime?

  activityLogs      ActivityLog[]
  contaminationEvents ContaminationEvent[]
}

model ActivityLog {
  id              String   @id @default(cuid())
  type            String
  timestamp       DateTime @default(now())
  description     String
  notes           String?
  durationMinutes Int?
  jarCount        Int?
  batchId         String?
  batch           Batch?   @relation(fields: [batchId], references: [id])
  jarId           String?
  jar             Jar?     @relation(fields: [jarId], references: [id])
}

model ContaminationEvent {
  id              String   @id @default(cuid())
  batchId         String?
  batch           Batch?   @relation(fields: [batchId], references: [id])
  jarId           String?
  jar             Jar?     @relation(fields: [jarId], references: [id])
  contaminationType String?
  notes           String?
  lostJarCount    Int
  createdAt       DateTime @default(now())
}
```

## Relationships
- One Batch has many Jars.
- One Batch has many ActivityLogs.
- One Batch has many ContaminationEvents.
- One Jar belongs to one Batch.
- One Jar can have many ActivityLogs and ContaminationEvents.
- ActivityLog can reference either a Batch, a Jar, or both depending on the event type.

## File Structure (Initial)
```text
cordyceps-lab-app/
├── AI_SYNC.md
├── index.html
├── package.json
├── vite.config.ts
├── tailwind.config.js
├── postcss.config.js
├── tsconfig.json
├── tsconfig.app.json
├── tsconfig.node.json
├── src/
│   ├── App.tsx
│   ├── main.tsx
│   ├── styles.css
│   └── assets/
├── public/
├── Dockerfile
├── config.yaml
├── run.sh
├── prisma/
│   └── schema.prisma
├── server/
│   ├── db.ts
│   ├── index.ts
│   └── routes/
└── README.md
```

## Current State & Next Steps
Current state:
- React + Vite foundation created and ready for styling and UI iteration.
- Dark-mode lab dashboard with quick-entry panel is in place.
- Core database schema has been defined around batches, jars, activity logs, and contamination events.
- The app is intended for HAOS packaging, but Docker and add-on files still need to be added.

Next steps:
1. Add Prisma schema and migration setup.
2. Add SQLite database initialization and API endpoints.
3. Build the dashboard data model and live CRUD operations.
4. Implement HAOS add-on packaging files.
5. Add batch/jar management screens and observation logging.

> Reminder: whenever the database schema, app logic, or major UI structure changes significantly, update this file so both AI assistants stay in sync.
