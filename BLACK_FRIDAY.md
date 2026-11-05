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

A campanha trabalha com os contatos e negócios que já existem no CRM. A importação alimenta apenas o Painel. O usuário abre o card, escolhe o consultor, informa a quantidade e clica em **Importar no CRM**: esse clique é a autorização, e a tela não libera lead sem enviar ao CRM. Funil, etapa e opções não aparecem na tela nem são aceitos pela API: o servidor define o Funil de Vendas e a etapa BLACK NOVEMBER (ou a única com "black" no nome). Se não houver como definir ou o CRM estiver fora do ar, a tela avisa e nenhum lead é reservado. Negócios perdidos são reabertos automaticamente.

O Painel consulta os destinos em `GET /api/v1/painel-nichos/stages` e enfileira solicitações para `POST /api/v1/painel-nichos/redistributions`. O CRM localiza automaticamente pelo telefone/WhatsApp, valida o escopo do solicitante e atualiza responsável do negócio, responsável do contato e etapa na mesma transação da auditoria. Os telefones originais são preservados.

Criar um negócio é o último recurso, porque os leads foram extraídos do próprio CRM. É automático. O CRM cria apenas se o telefone não for encontrado, o número for válido e não houver contato com o mesmo final de telefone, nome ou e-mail, ou se o contato encontrado não tiver nenhum negócio. O limite é de 20 criações por dia; acima disso, os itens ficam para revisão. O resultado aparece como **Negócio criado**.

O sistema decide sozinho os casos conhecidos, e as regras estão em `docs/painel-nichos-redistribution.md`, no CRM. Com vários contatos ou negócios, escolhe o cadastro com o nome da planilha, depois o negócio aberto, depois o mais recente. Com outro negócio ativo de outra pessoa, transfere o negócio e mantém o responsável do contato. Se a etapa exige campos vazios, o negócio entra nela mesmo assim e o consultor preenche depois. Esses dois casos aparecem como **Transferido com aviso**. Negócio perdido de outra equipe é transferido; negócio aberto de um responsável ativo de outra equipe é protegido: o lead volta à distribuição para outros supervisores, e o mesmo supervisor não o recebe de novo. O que não pode ser transferido aparece como **Não transferido**, com o motivo. Nos dois casos, outro lead disponível entra no lugar para o mesmo consultor. Se 25 dos últimos 30 resultados forem recusas, a reposição para, porque isso indica um problema geral e não leads ruins. Respostas incertas do CRM são repetidas sozinhas por até 10 minutos com o mesmo identificador, porque o CRM não aplica duas vezes a mesma solicitação; depois disso, ou em recusas que não dependem do lead, aparecem como **Com erro**. Solicitações antigas que criariam negócios da campanha também são suspensas para revisão pelo worker. Uma solicitação confirmada tem identificação estável, e o CRM impede uma segunda distribuição do mesmo contato na mesma campanha. Essa recusa aparece no Painel como **Já distribuído**, sem exigir revisão. Fora o caso de outra equipe, um lead recusado ou com erro continua reservado: voltar à distribuição só repetiria a mesma recusa nos próximos lotes. O motivo aparece no histórico de envios e na exportação.

### Implantação coordenada

1. Implantar o CRM.
2. Implantar o Painel, que usa os `CRM_API_URL` e `CRM_API_KEY` já configurados. Não há variáveis novas.
3. Validar com uma liberação de 1 ou 2 leads, marcando a atualização no CRM, e conferir o resultado lá.

Nenhum negócio é alterado sem o clique em **Importar no CRM**. Se o Painel subir antes do CRM, as etapas não carregam e nada é enviado. A integração usa tabelas existentes do CRM, sem migração nova naquele projeto. Se a migração de auditoria do Painel ainda não tiver sido aplicada, ela continua sendo necessária para a versão que grava esse histórico.

O histórico cronológico e os limites das verificações estão em `CONTEXTO_BLACK_FRIDAY.md`. Os testes do Painel são executados com `node --test scripts/test-crm-redistribution.cjs scripts/test-import-mapping.cjs`.
