# Production Dockerfile for MovieWatch (Worker + REST API + Static Dashboard)
FROM node:22-slim

WORKDIR /app

# Copy dependency manifests
COPY server/package*.json ./server/
COPY client/package*.json ./client/

# Install dependencies
RUN cd server && npm install
RUN cd client && npm install

# Copy source files
COPY server ./server
COPY client ./client

# Build both client and server
RUN cd client && npm run build
RUN cd server && npm run build

# Expose HTTP port
ENV PORT=4000
ENV NODE_ENV=production
EXPOSE 4000

# Start 24/7 monitor worker and dashboard API
WORKDIR /app/server
CMD ["node", "dist/index.js"]
