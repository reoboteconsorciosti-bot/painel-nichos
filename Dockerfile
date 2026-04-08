# Imagem base
FROM node:20-alpine AS base

# Etapa 1: Instalação de dependências
FROM base AS deps
# Alpine exige a biblioteca libc6-compat caso haja uso de binários nativos que precisam dela (ex: alguns engines de prisma)
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copia os arquivos de configuração de pacotes
COPY package.json package-lock.json* ./
COPY prisma ./prisma/

# Instala as dependências, incluindo prisma client
RUN npm ci

# Etapa 2: Builder
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Desativa a telemetria do Next.js e injeta ambiente de build
ENV NEXT_TELEMETRY_DISABLED 1

# Importante: O Prisma Generate deve rodar durante o build para criar os binários do ORM
RUN npx prisma generate
RUN npm run build

# Etapa 3: Runner (Produção Real)
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copia os diretórios necessários do Next.js standalone
COPY --from=builder /app/public ./public

# Configura as permissões para o standalone cache do Next.js
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Como usamos a feature output="standalone", ele copia apenas o mínimo necessário!
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# (Opcional) Copia a pasta prisma caso precise rodar migrations no container rodando a aplicação
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

USER nextjs

EXPOSE 3000
ENV PORT 3000

# Porta host padrão no Easypanel será convertida via Proxy, mas internamente roda na 3000.
# Além disso, usamos o node chamando o server.js gerado pelo "standalone" do Next.js
CMD ["node", "server.js"]
