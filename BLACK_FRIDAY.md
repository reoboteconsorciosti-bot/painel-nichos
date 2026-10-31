# Campanha Black Friday

## Preparar o banco

Depois de atualizar o código, aplique a migração no ambiente que contém o banco PostgreSQL:

```powershell
npx prisma migrate deploy
npx prisma generate
```

A migração cria a campanha de 2026. O card aparece para administradores e supervisores entre 30 de outubro e 30 de novembro de 2026.

## Importar os leads da campanha

Entre como administrador, abra **Importar dados** e escolha **Black Friday 2026 (campanha)**. Envie a planilha CSV ou Excel normalmente. A importação normaliza os telefones e ignora números já cadastrados; os leads importados ficam reservados para a campanha e não aparecem como disponíveis nos nichos regulares.

## Próximas edições

O ano e as datas ficam na tabela `black_friday_campaigns`; o histórico de cada lead fica em `black_friday_leads`. Para preparar a edição seguinte, crie uma linha com o novo ano, o nicho `black-friday-AAAA` e as datas de início e fim. A opção de importação e o mapeamento da pasta usam o ano corrente automaticamente. Um telefone já distribuído em qualquer edição continua bloqueado para evitar uma segunda distribuição.

Exemplo para criar a campanha de 2027 antes do período:

```sql
INSERT INTO black_friday_campaigns (year, name, nicho, is_active, starts_at, ends_at)
VALUES (2027, 'Black Friday 2027', 'black-friday-2027', true, DATE '2027-10-29', DATE '2027-11-30');
```

## CRM

A integração usa `CRM_API_URL` e `CRM_API_KEY`. O painel consulta `/api/v1/members` para a lista de responsáveis e cria um negócio por lead em `/api/v1/deals`. Cada negócio recebe o contato e uma descrição com campanha, consultor, supervisor e data da liberação. Sem responsável selecionado, o CRM escolhe um vendedor conforme a regra documentada para negócios.
