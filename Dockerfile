FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig*.json next.config.ts proxy.ts ./
COPY app ./app
COPY server ./server
COPY shared ./shared
COPY client ./client
COPY public ./public
RUN npm run build

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production PORT=3001 NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/next.config.ts ./next.config.ts
COPY --from=build /app/server ./server
COPY --from=build /app/shared ./shared
COPY --from=build /app/tsconfig.json ./tsconfig.json
COPY scripts/start-next.mjs ./scripts/start-next.mjs
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "scripts/start-next.mjs"]
