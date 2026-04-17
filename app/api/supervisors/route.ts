import { NextResponse } from "next/server"
import { getInitialUsers } from "@/lib/server-users"

export const runtime = "nodejs"

// Retorna apenas a lista de usuários sanitarizada sem expor as senhas secretas do servidor
export async function GET() {
  const users = getInitialUsers()
  const sanitized = users.map(({ password, ...rest }) => rest)
  return NextResponse.json({ ok: true, supervisors: sanitized })
}
