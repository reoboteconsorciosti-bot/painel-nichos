import { NextResponse } from "next/server"
import { serialize } from "cookie"

export const runtime = "nodejs"

export async function POST() {
  const cookieString = serialize("auth_token", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: -1, // Remove imediatamente o cookie
    path: "/",
  })

  // Cria a resposta com o cabeçalho zerado para expirar o cookie no navegador
  const response = NextResponse.json({ ok: true })
  response.headers.set("Set-Cookie", cookieString)

  return response
}
