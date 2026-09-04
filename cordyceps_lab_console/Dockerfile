FROM ghcr.io/home-assistant/base:latest

LABEL \
	io.hass.version="0.1.5" \
	io.hass.type="app" \
	io.hass.arch="amd64|aarch64"

RUN apk add --no-cache nodejs npm openssl

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
ENV DATABASE_URL="file:/data/lab.db"
COPY run.sh /run.sh
RUN chmod a+x /run.sh
RUN npx prisma generate
RUN npm run build

EXPOSE 3001

CMD ["/run.sh"]
