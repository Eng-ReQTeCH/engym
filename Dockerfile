FROM node:22.23-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
FROM node:22.23-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8080 DATA_DIR=/data
COPY --from=build /app/dist ./dist
COPY server ./server
COPY shared ./shared
COPY package.json ./
RUN mkdir -p /data/backups && chown -R node:node /data
USER node
EXPOSE 8080
VOLUME ["/data"]
HEALTHCHECK --interval=30s CMD node -e "fetch('http://localhost:8080/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node","server/index.mjs"]
