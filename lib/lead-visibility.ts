import { prisma } from "@/lib/prisma"
import type { AuthenticatedUser } from "@/lib/auth"

const SUPERVISOR_COUNT_SETTING = "supervisors_can_see_global_lead_counts"

export async function getSupervisorCountVisibility() {
  const setting = await prisma.appSetting.findUnique({ where: { key: SUPERVISOR_COUNT_SETTING } })
  return setting?.value !== "false"
}

export async function setSupervisorCountVisibility(enabled: boolean) {
  await prisma.appSetting.upsert({
    where: { key: SUPERVISOR_COUNT_SETTING },
    create: { key: SUPERVISOR_COUNT_SETTING, value: String(enabled) },
    update: { value: String(enabled) },
  })
}

export async function canViewGlobalLeadCounts(user: AuthenticatedUser) {
  return user.role === "admin" || (user.role === "supervisor" && await getSupervisorCountVisibility())
}
