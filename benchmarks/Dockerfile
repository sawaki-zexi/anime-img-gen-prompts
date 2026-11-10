FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run content:build
CMD ["node", "--import", "tsx", "benchmarks/run.ts", "--require-resources", "--out", "/results/report.json"]
