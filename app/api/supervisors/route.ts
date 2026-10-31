import { NextResponse } from "next/server"
import { getInitialUsers } from "@/lib/server-users"
import { getAuthenticatedUser } from "@/lib/auth"

export const runtime = "nodejs"

// Retorna apenas a lista de usuários sanitarizada sem expor as senhas secretas do servidor
export async function GET(req: Request) {
  const user = await getAuthenticatedUser(req)
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 })
  const users = getInitialUsers().filter((entry) => entry.role === "admin" && (user.role === "admin" || entry.id === user.id))
  const sanitized = users.map(({ password, ...rest }) => rest)
  return NextResponse.json({ ok: true, supervisors: sanitized })
}
