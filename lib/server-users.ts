import { type SupervisorConfig } from "@/lib/data"

export const getInitialUsers = (): SupervisorConfig[] => {
  return [
    {
      id: "admin-1",
      name: process.env.NAMEADMIN1 || "",
      email: process.env.EMAILADMIN1 || "",
      password: process.env.PASSWORDADMIN1 || "",
      role: "admin",
    },
    {
      id: "admin-2",
      name: process.env.NAMEADMIN2 || "",
      email: process.env.EMAILADMIN2 || "",
      password: process.env.PASSWORDADMIN2 || "",
      role: "admin",
    },
    {
      id: "adm-3",
      name: process.env.NAMEADMIN3 || "",
      email: process.env.EMAILADMIN3 || "",
      password: process.env.PASSWORDADMIN3 || "",
      role: "admin",
    },
    {
      id: "supervisor-1",
      name: process.env.NAMESUPERVISOR1 || "",
      email: process.env.EMAILSUPERVISOR1 || "",
      password: process.env.PASSWORDSUPERVISOR1 || "",
      role: "supervisor",
    },
    {
      id: "supervisor-2",
      name: process.env.NAMESUPERVISOR2 || "",
      email: process.env.EMAILSUPERVISOR2 || "",
      password: process.env.PASSWORDSUPERVISOR2 || "",
      role: "supervisor",
    },
  ]
}
