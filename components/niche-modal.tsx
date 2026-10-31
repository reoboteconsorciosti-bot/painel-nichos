"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import { NICHES, type Consultant } from "@/lib/data"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { LocationSelector } from "@/components/location-selector"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ArrowRight, Loader2, Zap } from "lucide-react"
import { Switch } from "@/components/ui/switch"

type Availability = { total: number | null; available: number | null; used: number | null; countsVisible: boolean }
interface NicheModalProps {
    isOpen: boolean
    onClose: () => void
    activeNicheId: string | null
    onGenerate: (nicheIds: string[], state: string, city: string, leadCount: number, consultantCrmId: string, consultantName: string, sendToCrm: boolean, crmOwnerId: string | null) => Promise<void>
    onCheckAvailability: (nicheIds: string[], state: string, city: string) => Promise<Availability>
    consultants: Consultant[]
}

export function NicheModal({ isOpen, onClose, activeNicheId, onGenerate, onCheckAvailability, consultants }: NicheModalProps) {
    const [state, setState] = useState("")
    const [city, setCity] = useState("")
    const [quantity, setQuantity] = useState("")
    const [consultantId, setConsultantId] = useState("")
    const [sendToCrm, setSendToCrm] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [availability, setAvailability] = useState<Availability | null>(null)
    const [checking, setChecking] = useState(false)
    const [availabilityError, setAvailabilityError] = useState(false)
    const checkRef = useRef(onCheckAvailability)
    checkRef.current = onCheckAvailability

    useEffect(() => {
        if (!isOpen) return
        setState("")
        setCity("")
        setQuantity("")
        setConsultantId("")
        setSendToCrm(false)
        setError(null)
    }, [isOpen, activeNicheId])

    useEffect(() => {
        setAvailability(null)
        setAvailabilityError(false)
        if (!isOpen || !state || !activeNicheId) {
            setChecking(false)
            return
        }
        let cancelled = false
        setChecking(true)
        const timer = setTimeout(async () => {
            try {
                const result = await checkRef.current([activeNicheId], state, city)
                if (!cancelled) setAvailability(result)
            } catch {
                if (!cancelled) setAvailabilityError(true)
            } finally {
                if (!cancelled) setChecking(false)
            }
        }, 300)
        return () => { cancelled = true; clearTimeout(timer) }
    }, [isOpen, activeNicheId, state, city])

    const niche = NICHES.find(n => n.id === activeNicheId)
    if (!niche) return null
    const consultant = consultants.find(c => c.crmUserId === consultantId)
    const count = Number(quantity)
    const validCount = Number.isSafeInteger(count) && count > 0
    const exceedsAvailable = availability?.available != null && count > availability.available
    const missing = !state ? "Selecione o estado." : !validCount ? "Informe uma quantidade inteira maior que zero." : !consultant ? "Selecione o consultor." : null
    const ready = !missing && !exceedsAvailable && !checking
    const Icon = niche.icon

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        if (!ready || submitting || !consultant || !activeNicheId) return
        setSubmitting(true)
        setError(null)
        try {
            const current = await checkRef.current([activeNicheId], state, city)
            setAvailability(current)
            if (current.available !== null && count > current.available) return
            await onGenerate([activeNicheId], state, city, count, consultantId, consultant.name, sendToCrm, sendToCrm ? consultantId : null)
            onClose()
        } catch (cause) {
            const message = cause instanceof Error ? cause.message : ""
            setError(message.startsWith("no_leads_available") ? "Não há contatos disponíveis nesta região. Escolha outra região." : message === "invalid_payload" ? "Confira a região, a quantidade e o consultor." : message && message !== "failed_to_create_list" ? message : "Não foi possível gerar a lista. Tente novamente.")
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={open => { if (!open && !submitting) onClose() }}>
            <DialogContent className="flex flex-col gap-0 overflow-hidden p-0 sm:max-w-[520px]" showCloseButton={!submitting} onEscapeKeyDown={e => { if (submitting) e.preventDefault() }} onPointerDownOutside={e => { if (submitting) e.preventDefault() }}>
                <DialogHeader className="shrink-0 border-b border-border p-5 pr-12 text-left">
                    <div className="mb-2 flex items-center gap-2 text-sm text-primary"><Icon className="size-4" />{niche.label}</div>
                    <DialogTitle className="text-xl">Gerar lista</DialogTitle>
                    <DialogDescription>Escolha a região, a quantidade e quem vai receber.</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
                    <fieldset disabled={submitting} className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-5 disabled:opacity-70">
                        <section className="space-y-3" aria-label="Região">
                            <h3 className="text-sm font-semibold">1. Onde buscar?</h3>
                            <LocationSelector selectedState={state} selectedCity={city} onStateChange={value => { setState(value); setCity(""); setError(null) }} onCityChange={value => { setCity(value); setError(null) }} />
                            <p className="text-xs text-muted-foreground">Cidade opcional. Em branco, busca no estado inteiro.</p>
                        </section>
                        <section className="space-y-2">
                            <label htmlFor="list-quantity" className="text-sm font-semibold">2. Quantos contatos?</label>
                            <input id="list-quantity" type="number" inputMode="numeric" min={1} step={1} value={quantity} onChange={e => { setQuantity(e.target.value); setError(null) }} placeholder="Ex.: 50" aria-invalid={exceedsAvailable || (quantity !== "" && !validCount)} aria-describedby="list-availability" className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                            <div id="list-availability" aria-live="polite" className="text-xs text-muted-foreground">
                                {checking ? "Consultando contatos disponíveis..." : availability?.countsVisible ? <span><strong className="text-foreground">{availability.available?.toLocaleString("pt-BR") ?? "—"}</strong> contatos disponíveis nesta região.</span> : availabilityError ? "Não foi possível consultar agora. Tentaremos ao gerar a lista." : state ? "A disponibilidade será validada ao gerar." : "Selecione o estado para ver a disponibilidade."}
                            </div>
                            {exceedsAvailable && <p role="alert" className="text-xs text-destructive">{availability?.available === 0 ? "Sem contatos disponíveis. Escolha outra região." : `Escolha até ${availability?.available} contatos ou altere a região.`}</p>}
                        </section>
                        <section className="space-y-2">
                            <label htmlFor="list-consultant" className="text-sm font-semibold">3. Para qual consultor?</label>
                            <Select value={consultantId} onValueChange={value => { setConsultantId(value); setError(null) }} disabled={submitting}>
                                <SelectTrigger id="list-consultant" className="h-10 w-full min-w-0 bg-background"><SelectValue placeholder="Selecione o consultor" /></SelectTrigger>
                                <SelectContent>{consultants.filter(c => c.crmUserId).map(c => <SelectItem key={c.crmUserId} value={c.crmUserId!}>{c.name}</SelectItem>)}</SelectContent>
                            </Select>
                            {consultants.filter(c => c.crmUserId).length === 0 && <p className="text-xs text-muted-foreground">Nenhum consultor disponível na equipe.</p>}
                        </section>
                        <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-secondary/20 p-3">
                            <div className="min-w-0 space-y-1">
                                <label htmlFor="list-crm" className="flex cursor-pointer items-center gap-2 text-sm font-semibold"><Zap className="size-4 text-primary" />Enviar ao CRM</label>
                                <p className="text-xs text-muted-foreground">{sendToCrm ? consultant ? `Responsável: ${consultant.name}` : "O consultor escolhido será o responsável no CRM." : "Ative para entregar os contatos no CRM."}</p>
                            </div>
                            <Switch id="list-crm" checked={sendToCrm} onCheckedChange={setSendToCrm} disabled={submitting} />
                        </div>
                    </fieldset>
                    <div className="shrink-0 space-y-2 border-t border-border bg-card p-4">
                        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
                        <p id="list-next-step" aria-live="polite" className="text-xs text-muted-foreground">{submitting ? "Aguarde a conclusão para evitar duplicar a lista." : missing ?? (checking ? "Consultando disponibilidade..." : exceedsAvailable ? "Ajuste a quantidade ou a região." : `${count} contatos para ${consultant?.name}${sendToCrm ? " • Envio ao CRM" : ""}`)}</p>
                        <button type="submit" disabled={!ready || submitting} aria-describedby="list-next-step" className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">
                            {submitting ? <><Loader2 className="size-4 animate-spin" />{sendToCrm ? "Gerando e enviando..." : "Gerando lista..."}</> : <>{sendToCrm ? "Gerar e enviar ao CRM" : "Gerar lista"}<ArrowRight className="size-4" /></>}
                        </button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    )
}
