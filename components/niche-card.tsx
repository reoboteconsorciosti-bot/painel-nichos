"use client"

import { cn } from "@/lib/utils"
import type { Niche } from "@/lib/data"
import { Check } from "lucide-react"

interface NicheCardProps {
  niche: Niche
  selected: boolean
  isEmpty?: boolean
  onSelect: (id: string) => void
}

export function NicheCard({ niche, selected, isEmpty = false, onSelect }: NicheCardProps) {
  const Icon = niche.icon

  return (
    <button
      onClick={() => {
        if (!isEmpty) onSelect(niche.id)
      }}
      disabled={isEmpty}
      className={cn(
        "group relative flex h-[280px] w-full flex-col justify-between overflow-hidden rounded-2xl bg-card p-6 text-left shadow-lg transition-all duration-300 ease-in-out",
        isEmpty ? "cursor-not-allowed opacity-60 grayscale-[0.8]" : "cursor-pointer hover:-translate-y-1 hover:scale-[1.02] hover:shadow-2xl",
        "border border-border/40",
        selected && "ring-2 ring-primary border-transparent shadow-primary/20"
      )}
    >
      {/* Background Gradient Overlay */}
      {!isEmpty && (
        <div
          className={cn(
            "absolute inset-0 bg-gradient-to-br transition-opacity duration-300",
            selected ? "opacity-100" : "opacity-50 group-hover:opacity-100",
            niche.color
          )}
        />
      )}
      
      {/* Dark overlay: Removed blur and made darker when empty */}
      <div 
        className={cn(
          "absolute inset-0", 
          isEmpty ? "bg-black/40" : "bg-background/20 backdrop-blur-[2px]"
        )} 
      />

      {/* Content Container */}
      <div className="relative z-10 flex h-full flex-col justify-between">
        
        {/* Top Section: Icon & Indicator */}
        <div className="flex items-start justify-between">
          <div className="flex flex-col gap-2">
            <div 
              className={cn(
                "flex h-12 w-12 items-center justify-center rounded-xl bg-background/60 backdrop-blur-md border border-foreground/5 shadow-sm transition-transform duration-300 group-hover:scale-110",
                selected && "bg-background/90"
              )}
            >
              <Icon className="size-6 text-foreground" />
            </div>
            <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-foreground/70 transition-colors group-hover:text-foreground">
              Segmento
            </p>
          </div>
          
          {selected && (
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md animate-in fade-in zoom-in duration-200">
              <Check className="size-4" />
            </div>
          )}
        </div>
        
        {/* Bottom Section: Title & Action */}
        <div className="flex flex-col gap-1.5">
          <h2 className="text-2xl font-bold tracking-tight text-foreground transition-colors group-hover:text-primary">
            {niche.label}
          </h2>
          <p className="text-sm font-medium leading-relaxed text-muted-foreground line-clamp-2">
            {niche.description}
          </p>
          
          <div className="mt-3 self-start">
            <span
              className={cn(
                "rounded-lg px-4 py-2 text-xs font-semibold tracking-wide backdrop-blur-md border border-foreground/5 transition-all duration-300",
                isEmpty 
                  ? "bg-black/50 text-muted-foreground border-border/30" 
                  : cn(
                      "bg-background/40 group-hover:bg-background/60",
                      selected ? "bg-primary/20 text-primary border-primary/20" : "text-foreground"
                    )
              )}
            >
              {isEmpty ? "Sem dados" : "Selecionar nicho"}
            </span>
          </div>
        </div>

      </div>
    </button>
  )
}
