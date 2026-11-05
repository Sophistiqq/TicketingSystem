FROM oven/bun:1 AS builder
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun --bun run build

FROM oven/bun:1
WORKDIR /app

COPY --from=builder /app/server ./server
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/generated ./generated
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/seed.ts /app/prisma.config.ts /app/package.json ./
RUN mkdir -p /app/data /app/uploads

EXPOSE 3000
CMD ["sh", "-c", "bun --bun run migrate:deploy && exec ./server"]
