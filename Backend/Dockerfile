# Use the official Bun image
FROM oven/bun:1 AS builder

WORKDIR /app

# Copy package files
COPY package.json bun.lock ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy the rest of the backend files
COPY . .

# Generate Prisma client and build the self-contained binary
RUN bun run build

RUN bun run migrate:deploy

# Runtime stage
FROM oven/bun:1-slim

WORKDIR /app

# Copy the compiled server binary and prisma folder (for migrations)
COPY --from=builder /app/server .
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json .

# Expose the backend port
EXPOSE 3000

# Start command: Run migrations then start the server
CMD ["sh", "-c", "./server"]
