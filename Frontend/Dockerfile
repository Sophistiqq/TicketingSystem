# Stage 1: Build
FROM oven/bun:1.4.4 AS builder

WORKDIR /app

# Copy package files
COPY package.json bun.lock ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy the rest of the frontend files
COPY . .

# Build the application
# VITE_API_URL should be provided as an build-arg or environment variable
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
ARG VITE_BASE_PATH=/
ENV VITE_BASE_PATH=$VITE_BASE_PATH
ARG FRONTEND_URL
ENV FRONTEND_URL=$FRONTEND_URL

RUN bun run build

# Stage 2: Serve
FROM oven/bun:1.4.4
WORKDIR /app

# Copy the SvelteKit Bun server and runtime dependencies
COPY --from=builder /app/build ./build
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/drizzle ./drizzle

ENV PORT=80

# Expose port 80
EXPOSE 80

CMD ["sh", "-c", "bun build/migrate.js && exec bun build/index.js"]
