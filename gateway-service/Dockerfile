FROM node:20-Slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install

FROM node:20-Slim
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY server.js .
EXPOSE 8080
CMD ["node", "server.js"]