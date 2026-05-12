import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export const runtime = "nodejs"

type ResetBody = {
  resetToken?: unknown
  confirm?: unknown
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as ResetBody

  const expected = process.env.RESET_TOKEN
  const provided = String(body.resetToken ?? "").trim()

  if (!expected || provided !== expected) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 })
  }

  // Requer confirmação explícita para evitar acidentes
  if (String(body.confirm ?? "").trim().toLowerCase() !== "deletar tudo") {
    return NextResponse.json({
      ok: false,
      error: "confirmation_required",
      message: "Envie confirm: 'deletar tudo' para confirmar a operação"
    }, { status: 400 })
  }

  try {
    // Conta antes de deletar
    const countListaLeads = await prisma.listaLead.count()
    const countListas = await prisma.lista.count()

    // Deleta em ordem (primeiro os links, depois as listas)
    const deletedLinks = await prisma.listaLead.deleteMany({})
    const deletedListas = await prisma.lista.deleteMany({})

    return NextResponse.json({
      ok: true,
      message: "Todas as listas foram resetadas",
      deleted: {
        listaLeadLinks: deletedLinks.count,
        listas: deletedListas.count,
      },
      previousCounts: {
        listaLeadLinks: countListaLeads,
        listas: countListas,
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg || "failed" }, { status: 500 })
  }
}
