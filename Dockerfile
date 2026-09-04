FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
ENV DATABASE_URL="file:/data/lab.db"
RUN npx prisma generate
RUN npm run build

EXPOSE 3001

CMD ["sh", "/app/run.sh"]
