FROM node:22.13-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY frontend ./frontend
COPY vite.config.js ./vite.config.js
RUN npm run build

FROM node:22.13-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server.mjs ./server.mjs
COPY src ./src
COPY policies ./policies
COPY data ./data
COPY --from=build /app/public ./public

ENV HOST=0.0.0.0
ENV PORT=4173
ENV PAYMENT_ADAPTER=simulator

EXPOSE 4173
CMD ["node", "server.mjs"]
