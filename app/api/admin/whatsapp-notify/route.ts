import { NextResponse } from "next/server"
import { jwtVerify } from "jose"
import { parse } from "cookie"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const getJwtSecretKey = () => {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error("JWT_SECRET is not set")
  return new TextEncoder().encode(secret)
}

async function requireAdmin(req: Request): Promise<void> {
  const cookieHeader = req.headers.get("cookie")
  if (!cookieHeader) throw new Error("unauthorized")

  const cookies = parse(cookieHeader)
  const token = cookies["auth_token"]
  if (!token) throw new Error("unauthorized")

  const { payload } = await jwtVerify(token, getJwtSecretKey())
  const role = String(payload.role ?? "")
  if (role !== "admin") throw new Error("forbidden")
}

function normalizeNotifyNumber(input: unknown): string {
  const raw = String(input ?? "").trim()
  if (!raw) return ""
  const digits = raw.replace(/\D+/g, "")
  if (!digits) return ""
  if (digits.length === 10 || digits.length === 11) return `55${digits}`
  if (digits.length === 12 || digits.length === 13) return digits
  return digits
}

async function getSettingValue(key: string): Promise<string> {
  const rows = await prisma.$queryRaw<Array<{ value: string }>>(
    Prisma.sql`SELECT value FROM app_settings WHERE key = ${key} LIMIT 1`,
  )
  return rows[0]?.value ?? ""
}

async function upsertSettingValue(key: string, value: string): Promise<void> {
  await prisma.$executeRaw(
    Prisma.sql`
      INSERT INTO app_settings (key, value, updated_at)
      VALUES (${key}, ${value}, NOW())
      ON CONFLICT (key)
      DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `,
  )
}

export async function GET(req: Request) {
  try {
    await requireAdmin(req)
    const value = await getSettingValue("whatsapp_notify_number")
    return NextResponse.json({ ok: true, value })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const status = msg === "forbidden" ? 403 : msg === "unauthorized" ? 401 : 500
    return NextResponse.json({ ok: false, error: msg }, { status })
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin(req)
    const body = (await req.json().catch(() => ({}))) as { value?: unknown }
    const value = normalizeNotifyNumber(body.value)

    await upsertSettingValue("whatsapp_notify_number", value)

    return NextResponse.json({ ok: true, value })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const status = msg === "forbidden" ? 403 : msg === "unauthorized" ? 401 : 500
    return NextResponse.json({ ok: false, error: msg }, { status })
  }
}
