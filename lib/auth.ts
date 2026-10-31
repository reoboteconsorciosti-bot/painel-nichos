import { jwtVerify } from "jose"
import { parse } from "cookie"

export type AuthenticatedUser = {
  id: string
  name: string
  email: string
  role: "admin" | "supervisor"
  teamId?: string
  isOwner: boolean
}

export async function getAuthenticatedUser(req: Request): Promise<AuthenticatedUser | null> {
  try {
    const token = parse(req.headers.get("cookie") ?? "")["auth_token"]
    const secret = process.env.JWT_SECRET
    if (!token || !secret) return null
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret))
    if (typeof payload.id !== "string" || typeof payload.role !== "string") return null
    if (payload.role !== "admin" && payload.role !== "supervisor") return null
    return {
      id: payload.id,
      name: typeof payload.name === "string" ? payload.name : "",
      email: typeof payload.email === "string" ? payload.email : "",
      role: payload.role,
      isOwner: payload.isOwner === true,
      ...(typeof payload.teamId === "string" ? { teamId: payload.teamId } : {}),
    }
  } catch {
    return null
  }
}
