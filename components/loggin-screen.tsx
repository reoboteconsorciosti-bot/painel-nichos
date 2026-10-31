"use client"

import { useEffect, useState } from "react"
import { Building2 } from "lucide-react"

export function LogginScreen() {
    const [error, setError] = useState("")

    useEffect(() => {
        const params = new URLSearchParams(window.location.search)
        const ssoError = params.get("sso_error")
        if (!ssoError) return
        const messages: Record<string, string> = {
            missing_token: "O CRM nao enviou um token de acesso.",
            invalid_or_expired_sso_token: "O link expirou. Entre pelo CRM novamente.",
            crm_user_not_authorized: "Seu usuario esta inativo ou nao pertence a equipe comercial autorizada.",
            crm_role_not_authorized: "Seu perfil do CRM nao tem acesso ao painel.",
            crm_unavailable: "Nao foi possivel validar seu acesso no CRM. Tente novamente.",
            crm_not_configured: "O acesso ao CRM ainda nao esta configurado neste painel.",
            unauthorized: "O CRM nao autorizou este acesso.",
        }
        setError(messages[ssoError] ?? "Falha no acesso pelo CRM.")
        window.history.replaceState({}, "", window.location.pathname)
    }, [])

    return (
        <div className="flex min-h-screen items-center justify-center bg-background p-4 text-foreground">
            <div className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
                <div className="bg-primary/10 px-8 py-10 text-center">
                    <img src="/logo.png" alt="Reobote Consorcios" className="mx-auto h-24 w-auto object-contain" />
                    <p className="mt-2 text-sm text-muted-foreground">Acesse o painel usando sua conta do CRM.</p>
                </div>
                <div className="p-8">
                    {error && <div role="alert" className="mb-4 rounded-lg bg-destructive/15 p-3 text-center text-sm font-medium text-destructive">{error}</div>}
                    <a
                        href="/api/auth/crm-sso/start"
                        className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-4 text-sm font-semibold text-foreground transition-colors hover:bg-primary/20"
                    >
                        <Building2 className="size-4" />
                        Entrar com o CRM
                    </a>
                    <p className="mt-4 text-center text-xs text-muted-foreground">
                        O acesso e validado pelo CRM. Donos recebem permissoes administrativas.
                    </p>
                </div>
            </div>
        </div>
    )
}
