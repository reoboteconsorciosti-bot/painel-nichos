import { NextResponse } from "next/server"
import { SignJWT } from "jose"
import { serialize } from "cookie"
import { getInitialUsers } from "@/lib/server-users"

export const runtime = "nodejs"

type LoginBody = {
  email?: unknown
  password?: unknown
}

const getJwtSecretKey = () => {
  const secret = process.env.JWT_SECRET
  if (!secret) {
    throw new Error("JWT_SECRET is not set")
  }
  return new TextEncoder().encode(secret)
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as LoginBody
    const email = String(body.email || "").trim().toLowerCase()
    const password = String(body.password || "")

    if (!email || !password) {
      return NextResponse.json({ ok: false, error: "Credenciais inválidas." }, { status: 400 })
    }

    const permitted = getInitialUsers().find(
      (s) => s.email.trim().toLowerCase() === email && s.password.trim() === password.trim(),
    )

    if (!permitted) {
      return NextResponse.json({ ok: false, error: "E-mail ou senha incorretos." }, { status: 401 })
    }

    // Criar o token JWT assinando a identidade do usuário
    const token = await new SignJWT({
      id: permitted.id,
      name: permitted.name,
      email: permitted.email,
      role: permitted.role,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("7d") // Duração de 7 dias
      .sign(getJwtSecretKey())

    // Preparar o Cookie Seguro The HttpOnly is essential.
    const cookieString = serialize("auth_token", token, {
      httpOnly: true, // Prevents JS from reading the cookie
      secure: process.env.NODE_ENV === "production", // Secure only in prod
      sameSite: "strict",
      maxAge: 60 * 60 * 24 * 7, // 7 dias
      path: "/",
    })

    const response = NextResponse.json({
      ok: true,
      user: {
        id: permitted.id,
        name: permitted.name,
        email: permitted.email,
        role: permitted.role,
      },
    })

    response.headers.set("Set-Cookie", cookieString)
    return response

  } catch (e) {
    return NextResponse.json({ ok: false, error: "Falha na autenticação." }, { status: 500 })
  }
}
