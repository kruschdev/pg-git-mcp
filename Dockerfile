# Multi-stage build for PG-Git

# 1. Build Client
FROM node:22-alpine AS client-builder
WORKDIR /app/client
COPY client/package*.json ./
RUN npm install
COPY client/ ./
RUN npm run build

# 2. Production Server
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY server/ ./server/
COPY db/ ./db/
COPY config.js config.json ./
COPY --from=client-builder /app/client/dist ./client/dist

ENV NODE_ENV=production
ENV PORT=4890
EXPOSE 4890

CMD ["node", "server/index.js"]
