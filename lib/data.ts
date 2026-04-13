import {
  Briefcase,
  Car,
  Hammer,
  HardHat,
  PawPrint,
  Pill,
  Palette,
  Shirt,
  ShoppingCart,
  Sofa,
  Scale,
  Stethoscope,
  Store,
  Heart,
  Wheat,
  Wrench,
  type LucideIcon,
} from "lucide-react"

export interface Niche {
  id: string
  label: string
  icon: LucideIcon
  description: string
  color: string
}

export const NICHES: Niche[] = [
  {
    id: "medicos",
    label: "Médicos",
    icon: Stethoscope,
    description: "Clinicas, hospitais e profissionais da saude",
    color: "from-emerald-500/20 to-emerald-500/5",
  },
  {
    id: "advogados",
    label: "Advogados",
    icon: Scale,
    description: "Escritorios e profissionais juridicos",
    color: "from-sky-500/20 to-sky-500/5",
  },
  {
    id: "engenheiros",
    label: "Engenheiros",
    icon: HardHat,
    description: "Engenharia civil, mecanica e eletrica",
    color: "from-amber-500/20 to-amber-500/5",
  },
  {
    id: "empresarios",
    label: "Empresarios",
    icon: Briefcase,
    description: "Donos de empresas e empreendedores",
    color: "from-teal-500/20 to-teal-500/5",
  },
  {
    id: "farmaceuticos",
    label: "Farmaceuticos",
    icon: Pill,
    description: "Farmacias, drogarias e profissionais da area",
    color: "from-violet-500/20 to-violet-500/5",
  },
  {
    id: "dentistas",
    label: "Dentistas",
    icon: Heart,
    description: "Clinicas odontologicas e profissionais da area",
    color: "from-pink-500/20 to-pink-500/5",
  },
  {
    id: "arquitetos",
    label: "Arquitetos",
    icon: Palette,
    description: "Arquitetura e design de interiores",
    color: "from-fuchsia-500/20 to-fuchsia-500/5",
  },
  {
    id: "auto-escola",
    label: "Auto Escola",
    icon: Car,
    description: "Centros de formacao de condutores",
    color: "from-blue-500/20 to-blue-500/5",
  },
  {
    id: "material-de-construcao",
    label: "Material de Construção",
    icon: Hammer,
    description: "Lojas de materiais, ferragens e afins",
    color: "from-orange-500/20 to-orange-500/5",
  },
  {
    id: "moveis-planejados",
    label: "Moveis Planejados",
    icon: Sofa,
    description: "Marcenaria planejada e moveis sob medida",
    color: "from-rose-500/20 to-rose-500/5",
  },
  {
    id: "produtor-rural",
    label: "Produtor Rural",
    icon: Wheat,
    description: "Produtores rurais e negocios do campo",
    color: "from-lime-500/20 to-lime-500/5",
  },
  {
    id: "auto-services",
    label: "Auto-Services",
    icon: Wrench,
    description: "Oficinas, auto center e servicos automotivos",
    color: "from-slate-500/20 to-slate-500/5",
  },
  {
    id: "lojas-de-roupa",
    label: "Lojas de Roupa",
    icon: Shirt,
    description: "Lojas de vestuario e moda",
    color: "from-red-500/20 to-red-500/5",
  },
  {
    id: "petshops",
    label: "Petshops",
    icon: PawPrint,
    description: "Pet shop, banho e tosa, clinicas veterinarias",
    color: "from-emerald-500/20 to-emerald-500/5",
  },
  {
    id: "supermercados",
    label: "Supermercados",
    icon: ShoppingCart,
    description: "Mercados, atacados e varejo alimentar",
    color: "from-yellow-500/20 to-yellow-500/5",
  },
  {
    id: "shopping",
    label: "Shopping",
    icon: Store,
    description: "Centros comerciais e lojas em shopping",
    color: "from-indigo-500/20 to-indigo-500/5",
  },
]

export interface Estado {
  sigla: string
  nome: string
  cidades: string[]
}

export const ESTADOS: Estado[] = [
  { sigla: "AC", nome: "Acre", cidades: ["Rio Branco", "Cruzeiro do Sul", "Sena Madureira"] },
  { sigla: "AL", nome: "Alagoas", cidades: ["Maceio", "Arapiraca", "Rio Largo"] },
  { sigla: "AP", nome: "Amapa", cidades: ["Macapa", "Santana", "Laranjal do Jari"] },
  { sigla: "AM", nome: "Amazonas", cidades: ["Manaus", "Parintins", "Itacoatiara"] },
  { sigla: "BA", nome: "Bahia", cidades: ["Salvador", "Feira de Santana", "Vitoria da Conquista", "Camacari", "Ilheus"] },
  { sigla: "CE", nome: "Ceara", cidades: ["Fortaleza", "Caucaia", "Juazeiro do Norte", "Maracanau", "Sobral"] },
  { sigla: "DF", nome: "Distrito Federal", cidades: ["Brasilia", "Ceilandia", "Taguatinga", "Samambaia"] },
  { sigla: "ES", nome: "Espirito Santo", cidades: ["Vitoria", "Vila Velha", "Serra", "Cariacica"] },
  { sigla: "GO", nome: "Goias", cidades: ["Goiania", "Aparecida de Goiania", "Anapolis", "Rio Verde"] },
  { sigla: "MA", nome: "Maranhao", cidades: ["Sao Luis", "Imperatriz", "Caxias", "Timon"] },
  { sigla: "MT", nome: "Mato Grosso", cidades: ["Cuiaba", "Varzea Grande", "Rondonopolis", "Sinop"] },
  { sigla: "MS", nome: "Mato Grosso do Sul", cidades: ["Campo Grande", "Dourados", "Tres Lagoas", "Corumba", "Maracaju", "Navirai", "Nova Andradina", "Ivinhema", "Angélica", "Bataguassu", "Batayporã", "Bonito", "Caarapó", "Cassilândia", "Chapadão do Sul", "Coxim", "Deodápolis", "El Dourado", "Fátima do Sul", "Glória de Dourados", "Itaporã", "Itaquiraí", "Jateí", "Laguna Carapã", "Mundo Novo", "Nioaque", "Nova Alvorada do Sul", "Paranaíba", "Pedro Gomes", "Ponta Porã", "Ribas do Rio Pardo", "Rio Brilhante", "São Gabriel do Oeste", "Selvíria", "Sidrolândia", "Sonora", "Taquarussu", "Três Lagoas"] },
  { sigla: "MG", nome: "Minas Gerais", cidades: ["Belo Horizonte", "Uberlandia", "Contagem", "Juiz de Fora", "Betim"] },
  { sigla: "PA", nome: "Para", cidades: ["Belem", "Ananindeua", "Santarem", "Maraba"] },
  { sigla: "PB", nome: "Paraiba", cidades: ["Joao Pessoa", "Campina Grande", "Santa Rita"] },
  { sigla: "PR", nome: "Parana", cidades: ["Curitiba", "Londrina", "Maringa", "Ponta Grossa", "Cascavel"] },
  { sigla: "PE", nome: "Pernambuco", cidades: ["Recife", "Jaboatao dos Guararapes", "Olinda", "Caruaru"] },
  { sigla: "PI", nome: "Piaui", cidades: ["Teresina", "Parnaiba", "Picos"] },
  { sigla: "RJ", nome: "Rio de Janeiro", cidades: ["Rio de Janeiro", "Niteroi", "Sao Goncalo", "Duque de Caxias", "Petropolis"] },
  { sigla: "RN", nome: "Rio Grande do Norte", cidades: ["Natal", "Mossoro", "Parnamirim"] },
  { sigla: "RS", nome: "Rio Grande do Sul", cidades: ["Porto Alegre", "Caxias do Sul", "Pelotas", "Canoas", "Santa Maria"] },
  { sigla: "RO", nome: "Rondonia", cidades: ["Porto Velho", "Ji-Parana", "Ariquemes"] },
  { sigla: "RR", nome: "Roraima", cidades: ["Boa Vista", "Rorainopolis"] },
  { sigla: "SC", nome: "Santa Catarina", cidades: ["Florianopolis", "Joinville", "Blumenau", "Chapeco", "Itajai"] },
  { sigla: "SP", nome: "Sao Paulo", cidades: ["Sao Paulo", "Guarulhos", "Campinas", "Sao Bernardo do Campo", "Ribeiro Preto", "Santos", "Sorocaba"] },
  { sigla: "SE", nome: "Sergipe", cidades: ["Aracaju", "Nossa Senhora do Socorro", "Lagarto"] },
  { sigla: "TO", nome: "Tocantins", cidades: ["Palmas", "Araguaina", "Gurupi"] },
]

export interface SupervisorConfig {
  id: string
  name: string
  email: string
  password?: string
  role: "admin" | "supervisor"
}

export interface Consultant {
  id: string
  name: string
  supervisorId: string // Vincula o consultor ao ID do supervisor
}

export const INITIAL_USERS: SupervisorConfig[] = [
  {
    id: "admin-1",
    name: process.env.NEXT_PUBLIC_NAMEADMIN1 || "",
    email: process.env.NEXT_PUBLIC_EMAILADMIN1 || "",
    password: process.env.NEXT_PUBLIC_PASSWORDADMIN1 || "",
    role: "admin",
  },
  {
    id: "admin-2",
    name: process.env.NEXT_PUBLIC_NAMEADMIN2 || "",
    email: process.env.NEXT_PUBLIC_EMAILADMIN2 || "",
    password: process.env.NEXT_PUBLIC_PASSWORDADMIN2 || "",
    role: "admin",
  },
  {
    id: "adm-3",
    name: process.env.NEXT_PUBLIC_NAMEADMIN3 || "",
    email: process.env.NEXT_PUBLIC_EMAILADMIN3 || "",
    password: process.env.NEXT_PUBLIC_PASSWORDADMIN3 || "",
    role: "admin",
  },
  {
    id: "supervisor-1",
    name: process.env.NEXT_PUBLIC_NAMESUPERVISOR1 || "",
    email: process.env.NEXT_PUBLIC_EMAILSUPERVISOR1 || "",
    password: process.env.NEXT_PUBLIC_PASSWORDSUPERVISOR1 || "",
    role: "supervisor",
  },
  {
    id: "supervisor-2",
    name: process.env.NEXT_PUBLIC_NAMESUPERVISOR2 || "",
    email: process.env.NEXT_PUBLIC_EMAILSUPERVISOR2 || "",
    password: process.env.NEXT_PUBLIC_PASSWORDSUPERVISOR2 || "",
    role: "supervisor",
  },
]

export const CONSULTORES: Consultant[] = [
]

