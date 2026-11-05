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

A campanha trabalha com os contatos e negócios que já existem no CRM. A importação alimenta apenas o Painel. O usuário abre o card, escolhe o consultor, informa a quantidade e clica em **Importar no CRM**: esse clique é a autorização, e a tela não libera lead sem enviar ao CRM. O destino já vem preenchido quando não há dúvida (Funil de Vendas e a única etapa com "black" no nome), e **Alterar** permite trocar o funil e a etapa. Negócios perdidos são reabertos automaticamente.

O Painel consulta os destinos em `GET /api/v1/painel-nichos/stages` e enfileira solicitações para `POST /api/v1/painel-nichos/redistributions`. O CRM localiza automaticamente pelo telefone/WhatsApp, valida o escopo do solicitante e atualiza responsável do negócio, responsável do contato e etapa na mesma transação da auditoria. Os telefones originais são preservados.

Criar um negócio é o último recurso, porque os leads foram extraídos do próprio CRM. É automático. O CRM cria apenas se o telefone não for encontrado, o número for válido e não houver contato com o mesmo final de telefone, nome ou e-mail, ou se o contato encontrado não tiver nenhum negócio. O limite é de 20 criações por dia; acima disso, os itens ficam para revisão. O resultado aparece como **Negócio criado**.

O sistema decide sozinho os casos conhecidos, e as regras estão em `docs/painel-nichos-redistribution.md`, no CRM. Com vários contatos ou negócios, escolhe o cadastro com o nome da planilha, depois o negócio aberto, depois o mais recente. Com outro negócio ativo de outra pessoa, transfere o negócio e mantém o responsável do contato. Se a etapa exige campos vazios, transfere o negócio e o mantém na etapa atual. Esses dois últimos aparecem como **Enviado com aviso**. O que não pode ser transferido, como lead sem negócio no funil ou de outra equipe, aparece como **Não transferido**, com o motivo. Respostas incertas do CRM, ou recusas que não dependem do lead, continuam **Com erro** e não são reenviadas. Solicitações antigas que criariam negócios da campanha também são suspensas para revisão pelo worker. Uma solicitação confirmada tem identificação estável, e o CRM impede uma segunda distribuição do mesmo contato na mesma campanha. Essa recusa aparece no Painel como **Já distribuído**, sem exigir revisão. Um lead recusado ou com erro continua reservado: não volta para a distribuição, porque repetiria a mesma recusa nos próximos lotes. O motivo aparece na lista e na exportação.

### Implantação coordenada

1. Implantar o CRM.
2. Implantar o Painel, que usa os `CRM_API_URL` e `CRM_API_KEY` já configurados. Não há variáveis novas.
3. Validar com uma liberação de 1 ou 2 leads, marcando a atualização no CRM, e conferir o resultado lá.

Nenhum negócio é alterado sem o clique em **Importar no CRM**. Se o Painel subir antes do CRM, as etapas não carregam e nada é enviado. A integração usa tabelas existentes do CRM, sem migração nova naquele projeto. Se a migração de auditoria do Painel ainda não tiver sido aplicada, ela continua sendo necessária para a versão que grava esse histórico.

O histórico cronológico e os limites das verificações estão em `CONTEXTO_BLACK_FRIDAY.md`. Os testes do Painel são executados com `node --test scripts/test-crm-redistribution.cjs scripts/test-import-mapping.cjs`.
