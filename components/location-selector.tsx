"use client"

import { ESTADOS } from "@/lib/data"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { MapPin, Building2 } from "lucide-react"

interface LocationSelectorProps {
  selectedState: string
  selectedCity: string
  onStateChange: (value: string) => void
  onCityChange: (value: string) => void
}

export function LocationSelector({
  selectedState,
  selectedCity,
  onStateChange,
  onCityChange,
}: LocationSelectorProps) {
  const selectedEstado = ESTADOS.find((e) => e.sigla === selectedState)

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
      <div className="flex flex-1 flex-col gap-2">
        <label className="flex items-center gap-2 text-sm font-medium text-foreground">
          <MapPin className="size-4 text-primary" />
          Estado
        </label>
        <Select value={selectedState} onValueChange={(val) => {
          onStateChange(val)
          onCityChange("")
        }}>
          <SelectTrigger className="w-full bg-secondary/50 border-border">
            <SelectValue placeholder="Selecione o estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>Estados</SelectLabel>
              {ESTADOS.map((estado) => (
                <SelectItem key={estado.sigla} value={estado.sigla}>
                  {estado.sigla} - {estado.nome}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-1 flex-col gap-2">
        <label className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Building2 className="size-4 text-primary" />
          Cidade
        </label>
        <Select value={selectedCity} onValueChange={onCityChange} disabled={!selectedState}>
          <SelectTrigger className="w-full bg-secondary/50 border-border">
            <SelectValue placeholder={selectedState ? "Selecione a cidade" : "Selecione um estado primeiro"} />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>Cidades</SelectLabel>
              {selectedEstado?.cidades.map((cidade) => (
                <SelectItem key={cidade} value={cidade}>
                  {cidade}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
