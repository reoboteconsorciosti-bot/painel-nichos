"use client"

import { useState } from "react"
import { Shield, Eye, EyeOff, Lock, Mail } from "lucide-react"
import { type SupervisorConfig } from "@/lib/data"

interface LogginScreenProps {
    onLogin: (supervisor: SupervisorConfig) => void
    supervisors: SupervisorConfig[]
}

export function LogginScreen({ onLogin, supervisors }: LogginScreenProps) {
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [showPassword, setShowPassword] = useState(false)
    const [error, setError] = useState("")

    const [loading, setLoading] = useState(false)

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault()
        setError("")

        if (!email.trim() || !password.trim()) {
            setError("Preencha todos os campos.")
            return
        }

        setLoading(true)
        try {
            const res = await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password })
            })
            const data = await res.json()
            if (!res.ok || !data.ok) {
                setError(data.error || "E-mail ou senha incorretos.")
            } else {
                onLogin(data.user)
            }
        } catch (err) {
            setError("Erro ao se comunicar com o servidor.")
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-background p-4 text-foreground">
            <div className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
                <div className="bg-primary/10 px-8 py-10 text-center">
                    <h1 className="text-2xl font-bold tracking-tight text-foreground justify-center flex items-center">
                        <img src="/logo.png" alt="Reobote Consórcios" className="h-24 w-auto object-contain justify-center " />
                    </h1>
                    <p className="mt-2 text-sm text-muted-foreground">
                        Acesse o seu painel de gerenciamento
                    </p>
                </div>

                <div className="p-8">
                    <form onSubmit={handleLogin} className="flex flex-col gap-5">
                        {error && (
                            <div className="rounded-lg bg-destructive/15 p-3 text-sm font-medium text-destructive text-center">
                                {error}
                            </div>
                        )}

                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-medium text-foreground">
                                E-mail
                            </label>
                            <div className="relative">
                                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-muted-foreground">
                                    <Mail className="size-4" />
                                </div>
                                <input
                                    type="email"
                                    placeholder="Seu e-mail de acesso"
                                    className="h-11 w-full rounded-lg border border-border bg-background pl-10 pr-4 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-all"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-medium text-foreground">
                                Senha
                            </label>
                            <div className="relative">
                                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-muted-foreground">
                                    <Lock className="size-4" />
                                </div>
                                <input
                                    type={showPassword ? "text" : "password"}
                                    placeholder="Sua senha secreta"
                                    className="h-11 w-full rounded-lg border border-border bg-background pl-10 pr-10 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-all"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground"
                                >
                                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                                </button>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="mt-2 flex h-11 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm hover:brightness-110 transition-all font-semibold disabled:opacity-70"
                        >
                            {loading ? "Validando..." : "Entrar no sistema"}
                        </button>
                    </form>

                    <p className="mt-6 text-center text-xs text-muted-foreground">
                        Acesso master padrão: admin@reobote.com / admin123
                    </p>
                </div>
            </div>
        </div>
    )
}
