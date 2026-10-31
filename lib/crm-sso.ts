import { createHmac, timingSafeEqual } from "node:crypto"
import { SignJWT } from "jose"
import { serialize } from "cookie"
import { getCRMMembers } from "@/lib/crm-members"

type CRMSsoPayload = {
  aud: "painel-nichos"
  userId: string
  email: string
  name: string
  organizationId: string
  iat: number
  exp: number
}

function getSharedSecret() {
  const secret = process.env.PAINEL_NICHOS_SSO_SECRET?.trim()
  if (!secret) throw new Error("PAINEL_NICHOS_SSO_SECRET is not configured")
  return secret
}

function verifyCRMSsoToken(token: string): CRMSsoPayload | null {
  const [encodedPayload, signature, extra] = token.split(".")
  if (!encodedPayload || !signature || extra !== undefined || !/^[a-f0-9]{64}$/i.test(signature)) return null

  const expected = createHmac("sha256", getSharedSecret()).update(encodedPayload).digest()
  const received = Buffer.from(signature, "hex")
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as Partial<CRMSsoPayload>
    const now = Math.floor(Date.now() / 1000)
    if (
      payload.aud !== "painel-nichos" ||
      typeof payload.userId !== "string" || !payload.userId ||
      typeof payload.email !== "string" || !payload.email ||
      typeof payload.name !== "string" ||
      typeof payload.organizationId !== "string" || !payload.organizationId ||
      typeof payload.iat !== "number" || typeof payload.exp !== "number" ||
      payload.exp <= now || payload.iat > now + 5 || payload.exp - payload.iat > 60 || now - payload.iat > 65
    ) return null
    return payload as CRMSsoPayload
  } catch {
    return null
  }
}

export async function establishCRMSSOSession(token: string): Promise<{ user: { id: string; name: string; email: string; role: "admin" | "supervisor"; isOwner: boolean } | null; cookie: string | null; error?: string }> {
  const payload = verifyCRMSsoToken(token)
  if (!payload) return { user: null, cookie: null, error: "invalid_or_expired_sso_token" }

  const members = await getCRMMembers()
  const member = members.find((candidate) => candidate.id === payload.userId)
  if (!member) {
    console.warn("[CRM_SSO] Member authorization rejected", {
      reason: "member_not_found_in_api_roster",
      userId: payload.userId,
    })
    return { user: null, cookie: null, error: "crm_user_not_authorized" }
  }

  const emailMatches = member.email.trim().toLowerCase() === payload.email.trim().toLowerCase()
  let authorizationFailure: string | null = null
  if (!member.active) authorizationFailure = "member_inactive"
  else if (member.role !== "OWNER" && member.area !== "SALES") authorizationFailure = "area_not_authorized"
  else if (!emailMatches) authorizationFailure = "email_mismatch"

  if (authorizationFailure) {
    console.warn("[CRM_SSO] Member authorization rejected", {
      reason: authorizationFailure,
      userId: payload.userId,
      memberRole: member.role,
      memberArea: member.area,
      memberActive: member.active,
    })
    return { user: null, cookie: null, error: "crm_user_not_authorized" }
  }

  let role: "admin" | "supervisor"
  if (member.role === "SUPERVISOR" && member.team?.leaderId === member.id && member.teamId === member.team.id) {
    role = "supervisor"
  } else if (member.role === "OWNER") {
    role = "admin"
  } else {
    return { user: null, cookie: null, error: "crm_role_not_authorized" }
  }

  const jwtSecret = process.env.JWT_SECRET
  if (!jwtSecret) throw new Error("JWT_SECRET is not configured")
  const user = { id: member.id, name: member.name, email: member.email, role, isOwner: member.role === "OWNER" }
  const sessionToken = await new SignJWT({ ...user, organizationId: payload.organizationId, teamId: member.teamId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(new TextEncoder().encode(jwtSecret))

  return {
    user,
    cookie: serialize("auth_token", sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    }),
  }
}

export function getCRMSSOStartUrl(): string | null {
  const crmUrl = (process.env.CRM_API_URL ?? "").trim().replace(/\/+$/, "")
  return crmUrl ? `${crmUrl}/api/painel-nichos-sso` : null
}

export function getPanelRedirectUrl(req: Request, path: string): URL {
  const configuredUrl = process.env.PAINEL_NICHOS_PUBLIC_URL?.trim()
  const baseUrl = configuredUrl ? new URL(configuredUrl) : new URL(req.url)

  if (baseUrl.protocol !== "https:" && process.env.NODE_ENV === "production") {
    throw new Error("PAINEL_NICHOS_PUBLIC_URL must use HTTPS in production")
  }

  baseUrl.pathname = "/"
  baseUrl.search = ""
  baseUrl.hash = ""
  return new URL(path, baseUrl)
}
