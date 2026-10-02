# syntax=docker/dockerfile:1

FROM node:20-alpine

WORKDIR /app

COPY apps/backend/package.json ./
RUN npm install

COPY apps/backend ./
RUN npx prisma generate

EXPOSE 3001

CMD ["npm", "run", "start:dev"]
