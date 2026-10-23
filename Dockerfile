FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-bookworm-slim
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY server ./server
COPY api/_mcp ./api/_mcp
# Server routes and analysis workers import shared modules, including transitive dependencies.
COPY src/lib ./src/lib
COPY db ./db
USER node
# Fail the image build if production runtime modules cannot load.
RUN node --input-type=module -e "await Promise.all([import('./server/app.js'), import('./server/migrate.js'), import('./api/_mcp/server.js'), import('./src/lib/decisionRunner.js')])"
EXPOSE 3000
CMD ["node", "server/index.js"]
