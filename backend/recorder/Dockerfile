FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json nest-cli.json tsconfig.json ./
RUN npm ci
COPY src ./src
RUN npm run build
RUN npm ci --only=production && cp -R node_modules /prod_modules

FROM node:18-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /prod_modules ./node_modules
COPY --from=builder /app/package.json ./
EXPOSE 3005
CMD ["node", "dist/main.js"]
