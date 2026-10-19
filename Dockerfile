FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY server ./server
COPY api/_mcp ./api/_mcp
COPY src/lib/agentExport.js ./src/lib/agentExport.js
COPY db ./db
USER node
EXPOSE 3000
CMD ["node", "server/index.js"]
