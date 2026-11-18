FROM node:24-slim

WORKDIR /app
ENV NODE_ENV=production

COPY package.json ./
COPY server.mjs ./
COPY public ./public

RUN mkdir -p data storage

EXPOSE 8788
CMD ["node", "server.mjs"]
