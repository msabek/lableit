# Lableit Web Frontend Dockerfile
# Build context: REPO ROOT (see docker-compose.prod.yml / Railway service config).
# The web app is part of a Bun workspace, so the root manifests + bun.lock and
# every workspace package.json must be present before `bun install`.

FROM oven/bun:1.3.12-alpine AS builder
RUN apk add --no-cache python3 make g++ libstdc++

WORKDIR /app

# Copy manifests first for a cacheable install layer. Bun needs every workspace
# package.json referenced by the workspace globs to build the dependency tree.
COPY package.json bun.lock ./
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/

RUN bun install --frozen-lockfile

# Copy the rest of the repo (root .dockerignore keeps secrets/models/etc. out).
COPY . .

# The root package.json has no "build" script — build must run inside apps/web,
# whose "build" script is `bunx vite build`. VITE_API_URL can be baked at build
# time; the runtime-config.js mechanism below allows overriding it without a
# rebuild, so a build-time value is optional.
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}
RUN cd apps/web && bun run build

# --- Production stage: serve static files via nginx ----------------------------
FROM nginx:alpine AS runner

# Copy the Vite build output.
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

# Copy the Railway nginx template (PORT and API_URL are injected at runtime).
COPY apps/web/nginx.railway.conf /etc/nginx/nginx.conf.template

# Startup script:
#   - generates /runtime-config.js so VITE_API_URL can be set at container start
#     (no rebuild needed),
#   - injects the runtime-config.js <script> into index.html (once),
#   - renders the nginx config from the template with the dynamic PORT/API_URL.
RUN apk add --no-cache gettext && \
    echo '#!/bin/sh' > /start.sh && \
    echo 'PORT=${PORT:-80}' >> /start.sh && \
    echo 'API_URL=${API_URL:-http://api.railway.internal:8080}' >> /start.sh && \
    echo 'cat > /usr/share/nginx/html/runtime-config.js <<EOF' >> /start.sh && \
    echo 'window.__LABLEIT_CONFIG__ = {' >> /start.sh && \
    echo '  VITE_API_URL: "${VITE_API_URL:-}"' >> /start.sh && \
    echo '};' >> /start.sh && \
    echo 'EOF' >> /start.sh && \
    echo 'if ! grep -q "runtime-config.js" /usr/share/nginx/html/index.html; then awk '"'"'1;/<head>/{print "    <script src=\"/runtime-config.js\"></script>"}'"'"' /usr/share/nginx/html/index.html > /tmp/index.html && mv /tmp/index.html /usr/share/nginx/html/index.html; fi' >> /start.sh && \
    echo 'envsubst '"'"'${PORT} ${API_URL}'"'"' < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf' >> /start.sh && \
    echo 'exec nginx -g "daemon off;"' >> /start.sh && \
    chmod +x /start.sh

ENV PORT=80
EXPOSE 80

# nginx:alpine ships busybox wget (not curl) — use wget for the healthcheck.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT}/ || exit 1

CMD ["/start.sh"]
