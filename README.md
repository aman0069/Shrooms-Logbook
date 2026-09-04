# Cordyceps Lab Console

A local-first lab management dashboard for Cordyceps militaris cultivation, designed for physical lab use and Home Assistant OS deployment.

## Stack
- React + Vite + TypeScript
- Tailwind CSS
- Framer Motion
- Express API
- SQLite via Prisma
- Home Assistant add-on packaging

## Local development

```bash
npm install
npm run dev
```

## Database

```bash
npx prisma generate
npx prisma db push
```

## Home Assistant add-on notes
- Package the app as a Docker add-on using `Dockerfile`, `config.yaml`, and `run.sh`.
- Use Ingress to expose the dashboard through Home Assistant.
- Keep metadata and data in the add-on storage volume.
