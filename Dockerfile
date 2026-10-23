FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY server/package*.json server/
COPY client/package*.json client/
RUN npm ci --prefix server && npm ci --prefix client
COPY server/tsconfig.json server/
COPY server/src server/src
COPY client client
COPY shared shared
RUN npm run build --prefix server && npm run build --prefix client && npm prune --omit=dev --prefix server

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=5000 DB_PATH=/app/data/journal.db SNAPSHOTS_DIR=/app/data/snapshots
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/server/node_modules server/node_modules
COPY --from=build /app/server/package.json server/package.json
COPY --from=build /app/client/dist client/dist
COPY --from=build /app/shared shared
RUN mkdir -p /app/data/snapshots && chown -R node:node /app/data
USER node
EXPOSE 5000
CMD ["node", "server/dist/index.js"]
