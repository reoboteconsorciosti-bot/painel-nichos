import { NextResponse } from "next/server"
import { jwtVerify } from "jose"
import { parse } from "cookie"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const getJwtSecretKey = () => {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error("JWT_SECRET is not set")
  return new TextEncoder().encode(secret)
}

export async function GET(req: Request) {
  try {
    const cookieHeader = req.headers.get("cookie")
    if (!cookieHeader) {
      return NextResponse.json({ ok: false, error: "No cookie provided" }, { status: 401 })
    }

    const cookies = parse(cookieHeader)
    const token = cookies["auth_token"]

    if (!token) {
      return NextResponse.json({ ok: false, error: "Token not found" }, { status: 401 })
    }

    // Valida o cookie e a criptografia
    const { payload } = await jwtVerify(token, getJwtSecretKey())

    return NextResponse.json({
      ok: true,
      user: {
        id: payload.id as string,
        name: payload.name as string,
        email: payload.email as string,
        role: payload.role as string,
      },
    })
  } catch (err) {
    // Caso de token malformado, vencido ou adulterado
    return NextResponse.json({ ok: false, error: "Token expired or invalid" }, { status: 401 })
  }
}
