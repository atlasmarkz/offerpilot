# OfferPilot 网页端镜像（Next.js standalone）。在仓库根目录构建：
#   docker build -t offerpilot-web .
# 运行时的配置全部走环境变量（见 deploy/.env.example），镜像里不含任何密钥。

# ---------- 1. 安装依赖 ----------
FROM node:20-bookworm-slim AS deps
WORKDIR /repo
# 国内服务器上构建时可以换成镜像源：docker compose build --build-arg NPM_REGISTRY=https://registry.npmmirror.com
ARG NPM_REGISTRY=https://registry.npmjs.org
RUN npm config set registry "$NPM_REGISTRY"
# 只拷 package.json 和锁文件，依赖没变时这一层直接用缓存
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/crawler/package.json apps/crawler/
COPY apps/extension/package.json apps/extension/
COPY packages/shared/package.json packages/shared/
# --ignore-scripts：跳过扩展的 postinstall（wxt prepare），网页端构建用不到
RUN npm ci --ignore-scripts --no-audit --no-fund

# ---------- 2. 构建 ----------
FROM node:20-bookworm-slim AS build
WORKDIR /repo
COPY --from=deps /repo/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1 NEXT_OUTPUT=standalone
RUN npm run build -w @offerpilot/web

# ---------- 3. 运行 ----------
FROM node:20-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
# 用非 root 用户运行
RUN groupadd --system --gid 1001 app && useradd --system --uid 1001 --gid app app
COPY --from=build --chown=app:app /repo/apps/web/.next/standalone ./
COPY --from=build --chown=app:app /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=app:app /repo/apps/web/public ./apps/web/public
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]
