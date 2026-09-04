import express from 'express'
import cors from 'cors'
import { prisma } from './db'

const app = express()
const port = Number(process.env.PORT ?? 3001)

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

app.listen(port, () => {
  console.log(`Lab API listening on http://localhost:${port}`)
})

process.on('SIGINT', async () => {
  await prisma.$disconnect()
  process.exit(0)
})
