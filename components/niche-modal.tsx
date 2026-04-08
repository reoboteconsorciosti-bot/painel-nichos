"use client"

import { useState, useEffect } from "react"
import { NICHES } from "@/lib/data"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { LocationSelector } from "@/components/location-selector"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Check, ArrowRight, Plus, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"

interface NicheModalProps {
    isOpen: boolean
    onClose: () => void
    activeNicheId: string | null
    onGenerate: (nicheIds: string[], state: string, city: string, leadCount: number, consultantName: string) => Promise<void>
    onCheckAvailability: (nicheIds: string[], state: string, city: string) => Promise<{ total: number; available: number; used: number }>
    onResetAvailability: (nicheIds: string[], state: string, city: string, resetToken: string) => Promise<{ total: number; available: number; used: number; deletedLinks: number }>
    consultants: string[]
}

export function NicheModal({
    isOpen,
    onClose,
    activeNicheId,
    onGenerate,
    onCheckAvailability,
    onResetAvailability,
    consultants,
}: NicheModalProps) {
    const [selectedNiches, setSelectedNiches] = useState<string[]>([])
    const [selectedState, setSelectedState] = useState("")
    const [selectedCity, setSelectedCity] = useState("")
    const [leadCount, setLeadCount] = useState<number | "">("")
    const [consultantName, setConsultantName] = useState("")
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [submitError, setSubmitError] = useState<string | null>(null)
    const [noLeadsModalOpen, setNoLeadsModalOpen] = useState(false)
    const [leadsInsufficientModalOpen, setLeadsInsufficientModalOpen] = useState(false)

    const [availability, setAvailability] = useState<{ total: number; available: number; used: number } | null>(null)
    const [availabilityLoading, setAvailabilityLoading] = useState(false)
    const [availabilityError, setAvailabilityError] = useState<string | null>(null)
    const [resetLoading, setResetLoading] = useState(false)
    const [resetError, setResetError] = useState<string | null>(null)

    const resetForm = () => {
        setSelectedState("")
        setSelectedCity("")
        setLeadCount("")
        setConsultantName("")
        setAvailability(null)
        setAvailabilityError(null)
        setResetError(null)
    }

    const validateForm = () => {
        return selectedState !== "" && typeof leadCount === "number" && (leadCount as number) > 0 && consultantName.trim() !== ""
    }

    // Reset state when modal opens
    useEffect(() => {
        if (isOpen) {
            resetForm()
            if (activeNicheId) {
                setSelectedNiches([activeNicheId])
            }
        }
    }, [isOpen, activeNicheId])

    const niche = NICHES.find((n) => n.id === activeNicheId)
    if (!niche) return null

    const Icon = niche.icon
    const isReady = validateForm()

    const handleGenerate = async () => {
        if (!isReady || typeof leadCount !== "number") return
        setIsSubmitting(true)
        setSubmitError(null)
        try {
            // Se já sabemos a disponibilidade, bloqueia cedo.
            if (availability && leadCount > availability.available) {
                setLeadsInsufficientModalOpen(true)
                return
            }

            // Se não consultou ainda, consulta rapidamente antes de criar lista.
            if (!availability && selectedState && selectedNiches.length > 0) {
                const res = await onCheckAvailability(selectedNiches, selectedState, selectedCity)
                setAvailability(res)
                if (leadCount > res.available) {
                    setLeadsInsufficientModalOpen(true)
                    return
                }
            }

            await onGenerate(selectedNiches, selectedState, selectedCity, leadCount, consultantName)
            onClose()
        } catch (err) {
            const raw = err instanceof Error ? err.message : "failed_to_create_list"
            if (raw === "no_leads_available" || raw.startsWith("no_leads_available")) {
                setNoLeadsModalOpen(true)
                return
            }
            const friendly =
                raw === "invalid_payload"
                    ? "Verifique estado, cidade, consultor e quantidade."
                    : raw === "failed_to_create_list"
                        ? "Nao foi possivel criar a lista. Tente novamente."
                        : raw
            setSubmitError(friendly)
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleCheckAvailability = async () => {
        if (!selectedState || selectedNiches.length === 0) return
        setAvailabilityLoading(true)
        setAvailabilityError(null)
        try {
            const res = await onCheckAvailability(selectedNiches, selectedState, selectedCity)
            setAvailability(res)
        } catch (err) {
            const raw = err instanceof Error ? err.message : "failed_to_check_availability"
            setAvailabilityError(raw)
        } finally {
            setAvailabilityLoading(false)
        }
    }

    const handleResetAvailability = async () => {
        if (!selectedState || selectedNiches.length === 0) return
        const resetToken = window.prompt("Digite o RESET_TOKEN para liberar os leads usados dessa cidade/UF/nicho:")
        if (!resetToken || !resetToken.trim()) return

        setResetLoading(true)
        setResetError(null)
        try {
            const res = await onResetAvailability(selectedNiches, selectedState, selectedCity, resetToken.trim())
            setAvailability({ total: res.total, available: res.available, used: res.used })
        } catch (err) {
            const raw = err instanceof Error ? err.message : "failed_to_reset"
            setResetError(raw)
        } finally {
            setResetLoading(false)
        }
    }

    return (
        <>
            <AlertDialog open={noLeadsModalOpen} onOpenChange={setNoLeadsModalOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Aviso</AlertDialogTitle>
                        <AlertDialogDescription>
                            Não há médicos disponiveis nessa região
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogAction onClick={() => setNoLeadsModalOpen(false)}>
                            Ok
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={leadsInsufficientModalOpen} onOpenChange={setLeadsInsufficientModalOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Leads Insuficientes</AlertDialogTitle>
                        <AlertDialogDescription>
                            A quantidade solicitada é maior que os leads disponíveis no banco.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogAction onClick={() => setLeadsInsufficientModalOpen(false)}>
                            Ok
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
                <DialogContent className="sm:max-w-[500px] p-0 overflow-hidden bg-card border-border">
                {/* Banner with gradient */}
                <div className={cn("h-24 w-full bg-gradient-to-br", niche.color)} />

                <div className="px-6 pb-6 pt-0 relative">
                    {/* Floating Icon */}
                    <div className="absolute -top-10 left-6 flex h-16 w-16 items-center justify-center rounded-xl bg-card border border-border shadow-sm">
                        <Icon className="size-8 text-foreground" />
                    </div>

                    <div className="mt-8 mb-6">
                        <DialogHeader>
                            <DialogTitle className="text-xl">{niche.label}</DialogTitle>
                            <DialogDescription>{niche.description}</DialogDescription>
                        </DialogHeader>
                    </div>

                    <div className="flex flex-col gap-6">
                        {/* Location */}
                        <div className="rounded-xl border border-border bg-secondary/20 p-4">
                            <LocationSelector
                                selectedState={selectedState}
                                selectedCity={selectedCity}
                                onStateChange={setSelectedState}
                                onCityChange={setSelectedCity}
                            />
                        </div>

                        {/* Lead Count */}
                        <div className="flex flex-col gap-2 rounded-xl border border-border bg-secondary/20 p-4">
                            <div className="flex items-center gap-2">
                                <Check className="size-4 text-primary" />
                                <span className="text-sm font-medium text-foreground">
                                    Quantidade de leads
                                </span>
                            </div>
                            <input
                                type="number"
                                inputMode="numeric"
                                min={1}
                                value={leadCount}
                                onChange={(e) => {
                                    const val = e.target.value
                                    const next = val === "" ? "" : Number(val)
                                    setLeadCount(next)
                                    if (typeof next === "number" && availability && next > availability.available) {
                                        setLeadsInsufficientModalOpen(true)
                                    }
                                }}
                                className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                                placeholder="Digite a quantidade de leads"
                            />
                            <p className="text-xs text-muted-foreground mt-1">
                                Defina quantos contatos você quer processar.
                            </p>
                        </div>

                        <div className="flex flex-col gap-2 rounded-xl border border-border bg-secondary/20 p-4">
                            <div className="flex items-center gap-2">
                                <Check className="size-4 text-primary" />
                                <span className="text-sm font-medium text-foreground">
                                    Leads no banco
                                </span>
                            </div>

                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={handleCheckAvailability}
                                    disabled={!selectedState || availabilityLoading || resetLoading}
                                    className={cn(
                                        "flex-1 h-10 rounded-md border text-sm font-semibold transition-all",
                                        !selectedState || availabilityLoading || resetLoading
                                            ? "cursor-not-allowed border-border bg-secondary text-muted-foreground opacity-60"
                                            : "border-border bg-background hover:bg-secondary/40",
                                    )}
                                >
                                    {availabilityLoading ? "Consultando..." : "Consultar"}
                                </button>
                                <button
                                    type="button"
                                    onClick={handleResetAvailability}
                                    disabled={!selectedState || availabilityLoading || resetLoading}
                                    className={cn(
                                        "flex-1 h-10 rounded-md border text-sm font-semibold transition-all",
                                        !selectedState || availabilityLoading || resetLoading
                                            ? "cursor-not-allowed border-border bg-secondary text-muted-foreground opacity-60"
                                            : "border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/15",
                                    )}
                                >
                                    {resetLoading ? "Resetando..." : "Reset"}
                                </button>
                            </div>

                            {availability && (
                                <div className="mt-2">
                                    <div className="text-sm text-muted-foreground">
                                        Total no banco: <span className="font-semibold text-foreground">{availability.total}</span>
                                    </div>
                                    <div className="text-xs text-muted-foreground mt-1">
                                        <div>Disponiveis agora: <span className="font-semibold text-foreground">{availability.available}</span></div>
                                        <div>Usados em listas: <span className="font-semibold text-foreground">{availability.used}</span></div>
                                    </div>
                                </div>
                            )}
                            {availabilityError && (
                                <p className="text-xs text-destructive mt-1">{availabilityError}</p>
                            )}
                            {resetError && (
                                <p className="text-xs text-destructive mt-1">{resetError}</p>
                            )}
                            <p className="text-xs text-muted-foreground mt-1">
                                O total e a quantidade de leads existentes no banco. "Disponiveis agora" sao os que ainda nao foram usados em listas. Se a cidade estiver em branco, consulta o estado inteiro.
                            </p>
                        </div>
                        <div className="flex flex-col gap-2 rounded-xl border border-border bg-secondary/20 p-3">
                            <div className="flex items-center gap-2">
                                <Check className="size-4 text-primary" />
                                <span className="text-sm font-medium text-foreground">
                                    Nome do Consultor
                                </span>
                            </div>
                            <Select value={consultantName} onValueChange={setConsultantName}>
                                <SelectTrigger className="w-full h-10 bg-background border-border">
                                    <SelectValue placeholder="Selecione o consultor" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectGroup>
                                        <SelectLabel>Equipe</SelectLabel>
                                        {consultants.map((name) => (
                                            <SelectItem key={name} value={name}>
                                                {name}
                                            </SelectItem>
                                        ))}
                                    </SelectGroup>
                                </SelectContent>
                            </Select>
                            <span className="text-xs text-muted-foreground mt-1" >
                                Defina para qual consultor essa lista será gerada.
                            </span>


                        </div>
                        {/* Generate Button */}
                        <button
                            onClick={handleGenerate}
                            disabled={!isReady || isSubmitting}
                            className={cn(
                                "mt-2 flex w-full items-center justify-center gap-2 rounded-lg px-6 py-3 text-sm font-semibold transition-all duration-200",
                                isReady && !isSubmitting
                                    ? "bg-primary text-primary-foreground hover:brightness-110 active:scale-[0.98]"
                                    : "cursor-not-allowed bg-secondary text-muted-foreground opacity-60"
                            )}
                        >
                            {isSubmitting ? (
                                "Criando..."
                            ) : isReady ? (
                                <>
                                    <Plus className="size-4" />
                                    Criar Lista
                                    <ArrowRight className="size-4" />
                                </>
                            ) : (
                                selectedState !== "" && selectedCity.trim() === "" ? "Selecione a cidade" : "Preencha a localizacao"
                            )}
                        </button>
                        {submitError && (
                            <p className="mt-2 text-xs text-destructive">
                                {submitError}
                            </p>
                        )}
                    </div>
                </div>
                </DialogContent>
            </Dialog>
        </>
    )
}
