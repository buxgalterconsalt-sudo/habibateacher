FROM node:24-slim

WORKDIR /app
ENV NODE_ENV=production

# Butun loyiha nusxalanadi: public/ papkasi bo'lmasa ham build ishlaydi.
COPY . /app

# Fayllar tekislangan (flattened) yuklangan bo'lsa, ularni joyiga qaytarish.
RUN mkdir -p /app/public /app/public/img /app/data /app/storage \
    && if [ -f /app/platform.css ]; then cp -f /app/platform.css /app/public/platform.css && rm -f /app/platform.css; fi \
    && if [ -d /app/img ]; then cp -rf /app/img/. /app/public/img/ && rm -rf /app/img; fi \
    && for f in /app/*.jpg /app/*.jpeg /app/*.png /app/*.webp /app/*.svg; do if [ -f "$f" ]; then mv -f "$f" /app/public/img/; fi; done \
    && if [ -f /app/download ]; then mv -f /app/download /app/.dockerignore; fi \
    && if [ -f "/app/download (1)" ]; then mv -f "/app/download (1)" /app/.gitignore; fi \
    && if [ -f /app/env.example ]; then mv -f /app/env.example /app/.env.example; fi

EXPOSE 8788
CMD ["node", "server.mjs"]
