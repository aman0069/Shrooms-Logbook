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
- Add this GitHub repository to Home Assistant under **Settings > Add-ons > Add-on store > Repositories**:
	`https://github.com/aman0069/Shrooms-Logbook`
- Install **Cordyceps Lab Console**, start it, and open it from the Home Assistant sidebar.
- Ingress provides the sidebar panel; the panel title is `Cordyceps Lab` and the icon is `mdi:flask`.
- The SQLite database is stored at `/data/lab.db` in the add-on storage volume.
