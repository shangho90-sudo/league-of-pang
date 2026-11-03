FROM node:22-alpine
WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --chown=node:node server ./server
COPY --chown=node:node src/sim ./src/sim
COPY --chown=node:node src/map ./src/map
COPY --chown=node:node src/data ./src/data
COPY --chown=node:node src/net ./src/net
USER node
ENV NODE_ENV=production PORT=8787 MAX_MATCHES=3
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "server/index.js"]
