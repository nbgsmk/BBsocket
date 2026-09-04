FROM node:24-bookworm

ENV NODE_ENV=production
ENV PORT=3000

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY app.js ./
COPY bin ./bin
COPY config ./config
COPY routes ./routes
COPY services ./services
COPY strategies ./strategies
COPY views ./views
COPY public ./public

### RUN npm install

RUN mkdir -p /app/data \
  && chown -R node:node /app

USER node

EXPOSE 3000

CMD ["npm", "start"]
