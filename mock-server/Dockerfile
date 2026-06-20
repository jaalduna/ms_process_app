# Mock backend for the ms-process demo deployment. Serves the mock /api/v1
# contract (sample data, no Databricks) and the SPA same-origin from SPA_DIR.
# Not the production backend — see ms-process-api (FastAPI) for that.
FROM node:20-slim

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY . .

# App Service routes to WEBSITES_PORT (8000). The SPA is read from the persisted
# /home volume (SPA_DIR) and demo auth accepts the Entra token.
ENV PORT=8000
EXPOSE 8000

CMD ["node", "server.js"]
