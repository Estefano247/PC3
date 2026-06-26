FROM node:18.20-alpine AS builder
WORKDIR /app
COPY package*.json nest-cli.json tsconfig.json ./
RUN npm install
COPY src ./src
RUN npm run build
RUN npm install --only=production && cp -R node_modules /prod_modules

FROM node:18.20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /prod_modules ./node_modules
COPY --from=builder /app/package.json ./
EXPOSE 3003
CMD ["node", "dist/main.js"]
