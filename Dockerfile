# Single-stage: pre-built dist checked in or built locally
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY dist/ ./dist/

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S kingbackend -u 1001
RUN chown -R kingbackend:nodejs /app
USER kingbackend

EXPOSE 8080

CMD ["node", "dist/api/server.js"]
