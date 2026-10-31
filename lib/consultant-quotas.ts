import type { Prisma, PrismaClient } from "@prisma/client"
import { prisma } from "@/lib/prisma"

type DbClient = PrismaClient | Prisma.TransactionClient

export function getCurrentMonthStart(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), 1)
}

export async function getLegacyMonthlyUsage(db: DbClient, legacyConsultantIndex: number, monthStart = getCurrentMonthStart()) {
  return db.listaLead.count({
    where: {
      lista: {
        consultorId: legacyConsultantIndex,
        createdAt: { gte: monthStart },
      },
    },
  })
}

export async function ensureMonthlyUsage(
  db: DbClient,
  crmUserId: string,
  legacyConsultantIndex: number,
  monthStart = getCurrentMonthStart(),
) {
  const existing = await db.consultantMonthlyUsage.findUnique({
    where: { crmUserId_monthStart: { crmUserId, monthStart } },
  })
  if (existing) return existing

  const legacyUsed = await getLegacyMonthlyUsage(db, legacyConsultantIndex, monthStart)
  return db.consultantMonthlyUsage.create({
    data: { crmUserId, monthStart, used: legacyUsed },
  })
}

export async function getConsultantMonthlyQuota(db: DbClient, crmUserId: string) {
  const quota = await db.consultantQuota.findUnique({ where: { crmUserId } })
  return quota?.monthlyLimit ?? 300
}

export async function consumeConsultantMonthlyQuota(
  tx: Prisma.TransactionClient,
  args: { crmUserId: string; legacyConsultantIndex: number; quantity: number },
) {
  const monthStart = getCurrentMonthStart()
  const [usage, limit] = await Promise.all([
    ensureMonthlyUsage(tx, args.crmUserId, args.legacyConsultantIndex, monthStart),
    getConsultantMonthlyQuota(tx, args.crmUserId),
  ])

  if (usage.used + args.quantity > limit) {
    const remaining = Math.max(0, limit - usage.used)
    throw new Error(`limit_exceeded|Limite mensal de ${limit} leads. Já foram usados ${usage.used}; restam ${remaining}.`)
  }

  await tx.consultantMonthlyUsage.update({
    where: { id: usage.id },
    data: { used: { increment: args.quantity } },
  })
}

export async function getMonthlyQuotaRows(crmUserIds: string[], legacyIndexes: Map<string, number>) {
  const monthStart = getCurrentMonthStart()
  const [usageRows, quotaRows] = await Promise.all([
    prisma.consultantMonthlyUsage.findMany({ where: { crmUserId: { in: crmUserIds }, monthStart } }),
    prisma.consultantQuota.findMany({ where: { crmUserId: { in: crmUserIds } } }),
  ])
  const usageById = new Map(usageRows.map((row) => [row.crmUserId, row.used]))
  const quotaById = new Map(quotaRows.map((row) => [row.crmUserId, row.monthlyLimit]))
  const legacyRows = await prisma.lista.findMany({
    where: { consultorId: { in: [...legacyIndexes.values()] }, createdAt: { gte: monthStart } },
    select: { id: true, consultorId: true, _count: { select: { leads: true } } },
  })
  const legacyUsageByIndex = new Map<number, number>()
  for (const row of legacyRows) {
    legacyUsageByIndex.set(row.consultorId, (legacyUsageByIndex.get(row.consultorId) ?? 0) + row._count.leads)
  }

  return new Map(crmUserIds.map((crmUserId) => {
    const legacyIndex = legacyIndexes.get(crmUserId) ?? 0
    return [crmUserId, {
      used: usageById.get(crmUserId) ?? legacyUsageByIndex.get(legacyIndex) ?? 0,
      monthlyLimit: quotaById.get(crmUserId) ?? 300,
    }]
  }))
}
