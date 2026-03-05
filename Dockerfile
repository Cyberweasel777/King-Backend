# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/
RUN NODE_OPTIONS="--max-old-space-size=4096" npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY --from=builder /app/dist/ ./dist/

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S kingbackend -u 1001
RUN chown -R kingbackend:nodejs /app
USER kingbackend

EXPOSE 8080

CMD ["node", "dist/api/server.js"]
