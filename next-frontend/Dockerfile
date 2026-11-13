FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG BACKEND_URL=http://backend:8000
ARG KAKAO_JAVASCRIPT_KEY
ENV BACKEND_URL=$BACKEND_URL KAKAO_JAVASCRIPT_KEY=$KAKAO_JAVASCRIPT_KEY NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ARG BACKEND_URL=http://backend:8000
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 BACKEND_URL=$BACKEND_URL
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json /app/next.config.ts ./
USER node
EXPOSE 3000
CMD ["npm", "run", "start", "--", "--hostname", "0.0.0.0"]
