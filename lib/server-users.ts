import { type SupervisorConfig } from "@/lib/data"

// APENAS lê variáveis server-side. Nunca usar NEXT_PUBLIC_ aqui.
const fromEnv = (name: string): string => process.env[name]?.trim() ?? ""

export const getInitialUsers = (): SupervisorConfig[] => {
  return [
    {
      id: "admin-1",
      name: fromEnv("NAMEADMIN1"),
      email: fromEnv("EMAILADMIN1"),
      password: fromEnv("PASSWORDADMIN1"),
      role: "admin",
    },
    {
      id: "admin-2",
      name: fromEnv("NAMEADMIN2"),
      email: fromEnv("EMAILADMIN2"),
      password: fromEnv("PASSWORDADMIN2"),
      role: "admin",
    },
    {
      id: "adm-3",
      name: fromEnv("NAMEADMIN3"),
      email: fromEnv("EMAILADMIN3"),
      password: fromEnv("PASSWORDADMIN3"),
      role: "admin",
    },
    {
      id: "supervisor-1",
      name: fromEnv("NAMESUPERVISOR1"),
      email: fromEnv("EMAILSUPERVISOR1"),
      password: fromEnv("PASSWORDSUPERVISOR1"),
      role: "supervisor",
    },
    {
      id: "supervisor-2",
      name: fromEnv("NAMESUPERVISOR2"),
      email: fromEnv("EMAILSUPERVISOR2"),
      password: fromEnv("PASSWORDSUPERVISOR2"),
      role: "supervisor",
    },
  ]
}
