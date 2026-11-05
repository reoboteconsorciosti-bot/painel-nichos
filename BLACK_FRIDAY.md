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

O ano e as datas ficam na tabela `black_friday_campaigns`; o histórico de cada lead fica em `black_friday_leads`. Para preparar a edição seguinte, crie uma linha com o novo ano, o nicho `black-friday-AAAA` e as datas de início e fim. A opção de importação e o mapeamento da pasta usam o ano corrente automaticamente. Um telefone já distribuído em qualquer edição continua bloqueado para evitar uma segunda distribuição, mesmo em outro formato (com DDI, zero inicial ou sem o nono dígito). A comparação usa `campaignPhoneKey` no momento da liberação, sem reescrever o telefone salvo. Desfazer uma importação cancela o envio que ainda estava pendente, mas mantém a reserva e o lead distribuído.

Exemplo para criar a campanha de 2027 antes do período:

```sql
INSERT INTO black_friday_campaigns (year, name, nicho, is_active, starts_at, ends_at)
VALUES (2027, 'Black Friday 2027', 'black-friday-2027', true, DATE '2027-10-29', DATE '2027-11-30');
```

## CRM

A campanha trabalha com os contatos e negócios que já existem no CRM. A importação alimenta apenas o Painel. Ao liberar os leads, o usuário pode marcar **Atualizar negócios existentes no CRM**, escolher o funil original e a etapa de destino. A opção começa desmarcada. Reabrir negócios perdidos exige uma autorização adicional na mesma tela.

O Painel consulta os destinos em `GET /api/v1/painel-nichos/stages` e enfileira solicitações para `POST /api/v1/painel-nichos/redistributions`. O CRM localiza automaticamente pelo telefone/WhatsApp, valida o escopo do solicitante e atualiza responsável do negócio, responsável do contato e etapa na mesma transação da auditoria. Os telefones originais são preservados. Não existe fallback de criação de contato ou negócio.

Casos sem correspondência, com vários contatos/negócios, fora do escopo ou com requisitos pendentes da etapa ficam para revisão. Solicitações antigas que criariam negócios da campanha também são suspensas para revisão pelo worker. Uma solicitação confirmada tem identificação estável, e o CRM impede uma segunda distribuição do mesmo contato na mesma campanha. Essa recusa aparece no Painel como **Já distribuído**, sem exigir revisão. Um lead cuja atualização falhou continua reservado: ele não volta para a distribuição, e o motivo aparece na lista de liberações e na exportação.

### Implantação coordenada

1. Aplicar e revisar `CRM_REDISTRIBUICAO.patch` no repositório do CRM. A base usada para preparar o patch foi o commit `72eae9815738e0e11f8a644ee92595e5dbcab014`.
2. No CRM, configurar `PAINEL_NICHOS_REASSIGN_API_KEY_ID` com o ID de uma chave dedicada autorizada. Esse valor não é o token secreto.
3. Implantar a API do CRM e o Painel; validar o fluxo em homologação.
4. No Painel, manter `CRM_API_URL` e `CRM_API_KEY` e configurar `CRM_EXISTING_DEALS_ENABLED=true` somente quando a nova API estiver pronta. Sem essa opção, a liberação local continua disponível e nenhuma nova redistribuição é enfileirada.

A ativação depende das duas variáveis acima. Sem elas, o código publicado não altera nenhum negócio. O patch usa tabelas existentes do CRM, sem migração nova naquele projeto. Se a migração de auditoria do Painel ainda não tiver sido aplicada, ela continua sendo necessária para a versão que grava esse histórico.

O histórico cronológico e os limites das verificações estão em `CONTEXTO_BLACK_FRIDAY.md`. Os testes do Painel são executados com `node --test scripts/test-crm-redistribution.cjs scripts/test-import-mapping.cjs`.
