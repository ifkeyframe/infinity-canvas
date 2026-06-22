# Debian/glibc base — sharp's native libvips binary is unreliable on Alpine/musl.
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM node:22-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
# Bind all interfaces — otherwise Next standalone binds to the container
# hostname only and Traefik (on another docker network) gets 502.
ENV HOSTNAME=0.0.0.0
ENV DATA_DIR=/data

# Persistent data lives on a mounted volume; create it owned by the runtime user.
RUN mkdir -p /data && chown -R node:node /data

# Next standalone output bundles only what the server needs (incl. traced sharp).
COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static

USER node
EXPOSE 3000
CMD ["node", "server.js"]
