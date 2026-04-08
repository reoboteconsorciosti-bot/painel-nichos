import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE "leads" DROP CONSTRAINT IF EXISTS "ck_leads_phone_not_cpf_cnpj"`)
    console.log('Constraint removida com sucesso!')
  } catch (e) {
    console.error('Erro ao remover constraint:', e)
  } finally {
    await prisma.$disconnect()
  }
}

main()
