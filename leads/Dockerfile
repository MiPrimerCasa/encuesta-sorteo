# --- Build frontend ---
FROM node:20-bookworm-slim AS build
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
# Workaround del bug de npm con optional deps (rollup + lightningcss)
RUN npm ci \
  && npm i --no-save \
       @rollup/rollup-linux-x64-gnu \
       lightningcss-linux-x64-gnu \
       @tailwindcss/oxide-linux-x64-gnu
COPY tsconfig.json vite.config.ts index.html ./
COPY public ./public
COPY docs/INSTRUCTIVO_USO_APLICACION.html ./docs/INSTRUCTIVO_USO_APLICACION.html
COPY scripts ./scripts
COPY src ./src
# Monorepo: https://dominio.com/leads — subdominio standalone: VITE_BASE=/
ARG VITE_BASE=/leads/
ENV VITE_BASE=${VITE_BASE}
RUN npm run build

# --- Runtime (API + static) ---
FROM node:20-bookworm-slim AS runtime
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

ARG CACHEBUST=1
RUN echo "cache bust ${CACHEBUST}"
COPY server ./server
COPY --from=build /app/dist ./dist

RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/leads/api/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/index.js"]
