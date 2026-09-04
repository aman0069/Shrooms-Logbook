import express from 'express'
import cors from 'cors'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { prisma } from './db'

const app = express()
const port = Number(process.env.PORT ?? 3001)
const currentDirectory = path.dirname(fileURLToPath(import.meta.url))
const staticDirectory = path.resolve(currentDirectory, '../dist')

app.use(cors())
app.use(express.json())

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, status: 'healthy' })
})

app.get('/api/batches', async (_req, res) => {
  const batches = await prisma.batch.findMany({
    include: {
      jars: true,
      activityLogs: {
        orderBy: { timestamp: 'desc' },
        take: 10,
      },
    },
  })

  res.json(batches)
})

app.use(express.static(staticDirectory))

app.get('*', (_req, res) => {
  res.sendFile(path.join(staticDirectory, 'index.html'))
})

app.listen(port, () => {
  console.log(`Lab API listening on http://localhost:${port}`)
})

process.on('SIGINT', async () => {
  await prisma.$disconnect()
  process.exit(0)
})
