FROM node:25-bookworm-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install

FROM node:25-bookworm-slim
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY server.js .
COPY public ./public
EXPOSE 8080
CMD ["node", "server.js"]