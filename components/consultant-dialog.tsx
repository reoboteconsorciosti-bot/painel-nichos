"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Plus, X, Users } from "lucide-react"

export interface ConsultantDialogProps {
    open: boolean
    onClose: () => void
    consultants: string[]
    onAdd: (name: string) => void
    onRemove: (name: string) => void
}

export function ConsultantDialog({ open, onClose, consultants, onAdd, onRemove }: ConsultantDialogProps) {
    const [newName, setNewName] = useState("")

    const handleAdd = () => {
        if (newName.trim()) {
            onAdd(newName.trim())
            setNewName("")
        }
    }

    return (
        <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Users className="size-5 text-primary" />
                        Gerenciar Equipe
                    </DialogTitle>
                    <DialogDescription>
                        Adicione ou remova consultores da lista de responsáveis.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col gap-4 py-4">
                    <div className="flex gap-2">
                        <Input
                            placeholder="Nome do consultor..."
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                        />
                        <button
                            onClick={handleAdd}
                            className="flex items-center justify-center rounded-md bg-primary px-3 text-primary-foreground hover:brightness-110 shrink-0 h-10"
                            disabled={!newName.trim()}
                        >
                            <Plus className="size-4" />
                        </button>
                    </div>

                    <div className="flex flex-wrap gap-2 mt-4 max-h-[200px] overflow-y-auto pr-2 pb-2">
                        {consultants.length === 0 ? (
                            <p className="text-xs text-muted-foreground italic w-full text-center py-2">
                                Nenhum consultor cadastrado
                            </p>
                        ) : (
                            consultants.map((consultant) => (
                                <Badge key={consultant} variant="secondary" className="gap-1.5 pr-1.5 flex items-center bg-secondary/50">
                                    {consultant}
                                    <button
                                        onClick={() => onRemove(consultant)}
                                        className="ml-1 rounded-sm p-0.5 hover:bg-destructive/20 hover:text-destructive text-muted-foreground transition-colors"
                                    >
                                        <X className="size-3" />
                                    </button>
                                </Badge>
                            ))
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
