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

# Runtime stage
FROM oven/bun:1-slim

WORKDIR /app

# Copy the compiled server binary and prisma folder (for migrations)
COPY --from=builder /app/server .
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json .

# Copy bun + prisma CLI from builder so we can run migrations at runtime
COPY --from=builder /root/.bun /root/.bun
COPY --from=builder /app/node_modules ./node_modules
ENV PATH="/root/.bun/bin:$PATH"

# Expose the backend port
EXPOSE 3000

# Start command: Run migrations then start the server
CMD ["sh", "-c", "bun run prisma migrate deploy && ./server"]
