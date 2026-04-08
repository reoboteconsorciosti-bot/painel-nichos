# 📘 Documentação Técnica — Painel de Nichos para Consultores

## 1. Visão Geral do Projeto

O projeto consiste na criação de um **Painel de Nichos** onde consultores poderão:

* Visualizar nichos disponíveis
* Selecionar um ou mais nichos
* Gerar automaticamente uma **lista de contatos** baseada em uma base de dados existente em Excel

O objetivo principal é **automatizar a distribuição e geração de leads** para consultores, centralizando a tomada de decisão e evitando processos manuais.

---

## 2. Objetivo do Sistema

Criar um sistema que:

* Organize nichos de atuação
* Permita seleção controlada por consultor
* Gere listas automaticamente
* Consuma dados vindos de planilhas Excel armazenadas no servidor
* Escale para múltiplos usuários simultâneos

---

## 3. Escopo Inicial (MVP)

### Funcionalidades principais

* [x] Painel visual de nichos (já existente)
* [ ] Seleção de nichos pelo consultor
* [ ] Botão **Criar Lista**
* [ ] Leitura da base Excel no servidor
* [ ] Filtragem por nicho
* [ ] Geração da lista personalizada
* [ ] Associação da lista ao consultor logado
* [ ] Exibição da lista no painel

---

## 4. Fluxo do Usuário

1. Consultor faz login
2. Acessa o painel de nichos
3. Seleciona 1 ou mais nichos
4. Clica em **Criar Lista**
5. Sistema consulta base de dados Excel
6. Sistema filtra registros por nicho
7. Lista é criada e salva
8. Consultor visualiza e utiliza seus leads

---

## 5. Arquitetura Proposta

### Frontend

* Next.js (App Router)
* TailwindCSS
* Server Actions / API Routes

### Backend

* Node.js (Next API Routes)
* Processamento de arquivos Excel
* Lógica de geração de listas

### Banco de Dados (Recomendado)

* PostgreSQL

### Infraestrutura

* Servidor VPS ou EasyPanel
* Armazenamento interno para planilhas Excel

---

## 6. Estrutura de Dados

### Entidade: Consultor

| Campo     | Tipo     |
| --------- | -------- |
| id        | UUID     |
| nome      | string   |
| email     | string   |
| criado_em | datetime |

---

### Entidade: Nicho

| Campo | Tipo    |
| ----- | ------- |
| id    | UUID    |
| nome  | string  |
| ativo | boolean |

---

### Entidade: Lista

| Campo        | Tipo     |
| ------------ | -------- |
| id           | UUID     |
| consultor_id | UUID     |
| data_criacao | datetime |

---

### Entidade: Lead

| Campo        | Tipo   |
| ------------ | ------ |
| id           | UUID   |
| lista_id     | UUID   |
| nome         | string |
| telefone     | string |
| nicho        | string |
| origem_excel | string |

---

## 7. Integração com Excel

### Fonte de Dados

* Planilhas Excel armazenadas no servidor
* Cada linha representa um possível lead
* Cada registro contém informação de nicho

### Estratégia

1. Ler Excel via backend
2. Converter para JSON
3. Filtrar por nicho selecionado
4. Persistir leads no banco

### Biblioteca Sugerida

```
xlsx
```

---

## 8. Fluxo Técnico da Geração da Lista

1. Front envia nichos selecionados
2. API recebe requisição
3. API abre arquivo Excel
4. Sistema filtra registros
5. Sistema cria nova lista
6. Leads são vinculados ao consultor
7. Retorno da lista para o frontend

---

## 9. Estrutura de Pastas Sugerida

```
/app
  /dashboard
  /api
    /nichos
    /listas
/lib
  excelReader.ts
  listGenerator.ts
/database
  prisma
```

---

## 10. Regras de Negócio (Inicial)

* Um consultor pode gerar múltiplas listas
* Uma lista pertence apenas a um consultor
* Nichos podem ser combinados
* Leads não devem repetir entre listas ativas

---

## 11. Pontos de Escalabilidade (Futuro)

* Cache de leitura do Excel
* Migração total para banco de dados
* Sistema de distribuição automática de leads
* Limite de leads por consultor
* Dashboard de performance

---

## 12. Segurança

* Autenticação obrigatória
* Validação de nichos permitidos
* Controle de duplicidade
* Logs de geração de listas

---

## 13. Próximos Passos

1. Implementar endpoint `POST /api/listas/create`
2. Implementar parser do Excel
3. Criar lógica de filtragem
4. Salvar listas no banco
5. Exibir listas no dashboard

---

## 14. Visão Estratégica

Este sistema evolui naturalmente para um:

* Distribuidor inteligente de leads
* CRM interno de consultores
* Plataforma escalável de geração de oportunidades

---

**Status:** MVP em construção
**Responsável Técnico:** Definir
**Stack Principal:** Next.js + Node.js + PostgreSQL
