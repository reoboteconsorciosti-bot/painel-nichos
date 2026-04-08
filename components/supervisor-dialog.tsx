"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { ShieldAlert, Mail, Lock, User, UserCheck, Plus, X } from "lucide-react"
import { type SupervisorConfig } from "@/lib/data"

export interface SupervisorDialogProps {
    open: boolean
    onClose: () => void
    supervisors: SupervisorConfig[]
    onAdd: (supervisor: SupervisorConfig) => void
    onRemove: (id: string) => void
}

export function SupervisorDialog({
    open,
    onClose,
    supervisors,
    onAdd,
    onRemove,
}: SupervisorDialogProps) {
    const [newName, setNewName] = useState("")
    const [newEmail, setNewEmail] = useState("")
    const [newPassword, setNewPassword] = useState("")
    const [role, setRole] = useState<"admin" | "supervisor">("supervisor")

    const handleAdd = () => {
        if (newName.trim() && newEmail.trim() && newPassword.trim()) {
            onAdd({
                id: crypto.randomUUID(),
                name: newName.trim(),
                email: newEmail.trim(),
                password: newPassword.trim(),
                role
            })
            setNewName("")
            setNewEmail("")
            setNewPassword("")
        }
    }

    const isFormValid = newName.trim() !== "" && newEmail.trim() !== "" && newPassword.trim() !== ""

    return (
        <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
            <DialogContent className="sm:max-w-[450px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <ShieldAlert className="size-5 text-primary" />
                        Gerenciar Acessos ao Sistema
                    </DialogTitle>
                    <DialogDescription>
                        Configure quem pode fazer login como Administrador ou Supervisor.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col gap-4 mt-2">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="col-span-2 relative">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                            <Input
                                className="pl-9"
                                placeholder="Nome do usuário"
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                            />
                        </div>
                        <div className="col-span-2 sm:col-span-1 relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                            <Input
                                type="email"
                                className="pl-9"
                                placeholder="E-mail de login"
                                value={newEmail}
                                onChange={(e) => setNewEmail(e.target.value)}
                            />
                        </div>
                        <div className="col-span-2 sm:col-span-1 relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                            <Input
                                type="text"
                                className="pl-9"
                                placeholder="Senha de acesso"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                            />
                        </div>
                    </div>

                    <div className="flex gap-2 w-full mt-1">
                        <button
                            onClick={() => setRole("supervisor")}
                            className={`flex-1 py-2 text-sm rounded-md border font-medium transition-all ${role === "supervisor" ? "bg-primary text-primary-foreground border-primary" : "bg-transparent text-muted-foreground border-border hover:bg-secondary"}`}
                        >
                            Supervisor
                        </button>
                        <button
                            onClick={() => setRole("admin")}
                            className={`flex-1 py-2 text-sm rounded-md border font-medium transition-all flex items-center justify-center gap-2 ${role === "admin" ? "bg-primary text-primary-foreground border-primary" : "bg-transparent text-muted-foreground border-border hover:bg-secondary"}`}
                        >
                            <ShieldAlert className="size-4" /> Admin
                        </button>
                    </div>

                    <button
                        onClick={handleAdd}
                        className="w-full flex items-center justify-center rounded-md bg-primary py-2.5 text-primary-foreground hover:brightness-110 font-semibold disabled:opacity-50 mt-2"
                        disabled={!isFormValid}
                    >
                        <Plus className="size-4 mr-2" />
                        Cadastrar Usuário
                    </button>

                    <div className="h-px bg-border my-2" />

                    <p className="text-sm font-medium text-foreground">Acessos cadastrados:</p>
                    <div className="flex flex-col gap-2 max-h-[220px] overflow-y-auto pr-2">
                        {supervisors.length === 0 ? (
                            <p className="text-xs text-muted-foreground italic w-full py-2">
                                Nenhum acesso cadastrado
                            </p>
                        ) : (
                            supervisors.map((supervisor) => (
                                <div key={supervisor.id} className="flex items-center justify-between rounded-lg border border-border bg-secondary/30 p-2.5">
                                    <div className="flex items-center gap-3">
                                        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/20 text-primary">
                                            {supervisor.role === "admin" ? <ShieldAlert className="size-4" /> : <UserCheck className="size-4" />}
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-foreground leading-tight">{supervisor.name}</p>
                                            <p className="text-xs text-muted-foreground">{supervisor.email}</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => onRemove(supervisor.id)}
                                        className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors shrink-0"
                                        title="Remover usuário"
                                    >
                                        <X className="size-4" />
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
