FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3200

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .
RUN mkdir -p data/users data/songs data/generated-images

EXPOSE 3200

CMD ["node", "server.js"]
