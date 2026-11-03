# Importação com mapeamento e descrição no CRM

Fluxo: Importar contatos → escolher arquivo e nicho → mapear colunas → conferir a prévia → importar. Não há escrita no banco na etapa de prévia. São aceitos XLSX e CSV, até 20 MB e 5.000 linhas de dados, com seleção de aba e linha de cabeçalho. Cabeçalhos duplicados devem ser corrigidos na origem.

Nome e telefone são necessários no mapeamento. Nos nichos comuns, também é necessário mapear a UF ou preencher uma UF para toda a planilha; na Black Friday, localização não é exigida. Várias colunas podem usar o destino **Descrição do negócio**: os valores não vazios são unidos com os nomes das colunas, uma informação por linha. Colunas marcadas como **Ignorar** não são importadas. Telefones existentes no Painel não são duplicados; o envio deles ao CRM só ocorre quando a opção de envio é marcada.

O mapeamento é validado novamente no servidor contra o arquivo enviado. O cabeçalho, a aba e o mapeamento confirmados são usados na importação. A normalização existente de telefones, cidades e estados continua sendo aplicada. Nome, telefone, empresa, cidade, estado, e-mail, cargo, descrição e ID de negócio são preservados até a geração da lista.

## Comportamento confirmado na documentação pública do CRM

Fonte consultada em 03/11/2026: https://crm.reoboteconsorcios.com.br/docs

- `POST /api/v1/contacts` cria ou atualiza pelo telefone/WhatsApp. O responsável já atribuído a um contato não é trocado por reenvio externo; os avisos do CRM precisam ser exibidos.
- `POST /api/v1/contacts/bulk` aceita até 500 contatos por chamada, 10 chamadas/minuto. Não cria negócios e não é o destino da descrição.
- `POST /api/v1/deals` aceita `description` junto com `contact` ou `contactId`. Cria um negócio novo em cada chamada. Sem `pipelineId` e `stageId`, usa o funil padrão e sua primeira etapa. Ambos são opcionais e precisam ser enviados juntos quando usados.
- `PATCH /api/v1/deals/:id` aceita somente `note`, até 2.000 caracteres. Acrescenta uma nota com data/hora à descrição existente. Não é uma edição geral do negócio.
- Criação e nota em negócios têm limite de 30 requisições/minuto por chave. Respostas 429 usam `Retry-After`.
- A documentação pública não oferece busca/listagem de negócios para encontrar automaticamente um negócio existente pelo telefone. Portanto, a nota em negócio existente depende de uma coluna com seu ID. Sem ID, o comportamento explícito é criar um novo negócio quando houver descrição.
- Membros fornecem o `id` usado em `ownerId`; somente consultores autorizados podem receber as listas. Disponibilidade e agendamentos são endpoints separados e não são acionados pela importação. Webhooks de saída e validação de assinatura não são necessários para este fluxo.

## Envio e acompanhamento

O envio ao CRM é opcional e vem desmarcado. Quando selecionado, os contatos válidos, inclusive telefones que o Painel já tinha, são enviados. A API do CRM atualiza o contato existente pelo telefone/WhatsApp. Telefones repetidos dentro do mesmo arquivo são agrupados para evitar criar negócios em duplicidade.

- Contatos são agrupados em lotes de até 500 e enfileirados para `POST /api/v1/contacts/bulk`. A fila respeita o limite documentado de 10 chamadas por minuto.
- Com descrição e sem ID de negócio, a importação também enfileira a criação de um negócio com a descrição mapeada.
- Com descrição e ID de negócio, a importação enfileira o acréscimo da nota nesse negócio. Não troca seu responsável nem cria outro negócio.
- Gerar uma lista continua permitindo sincronizar o contato com o consultor escolhido e criar o negócio naquele momento. Na campanha Black Friday, os dados mapeados também são preservados e o envio usa a mesma fila.

A fila é idempotente por arquivo, mapeamento e linha para importações, e por lista/lead para a geração de listas. A aplicação processa a fila em segundo plano, independente da aba do navegador, coordena réplicas com um lock do PostgreSQL e respeita os limites de contatos em lote e de negócios. Uma resposta 429 pausa o endpoint correspondente conforme `Retry-After`.

Erros de validação ficam como `failed`. Timeout, falha de rede, resposta ambígua ou erro 5xx ficam como `needs_review`: é necessário conferir o CRM antes de reenviar, porque a API não documenta uma chave de idempotência para criação de negócios ou acréscimo de notas. Pedidos interrompidos por reinício também não são reenviados cegamente. Não há retry automático para resultados incertos. Avisos de responsável são preservados e mostrados no painel.

## Deploy

1. Aplicar as migrations `20261103_import_mapping_crm_descriptions` e `20261103_import_mapping_crm_descriptions_2_allow_crm_import_queue` no PostgreSQL **antes de iniciar a nova versão**. A segunda migration permite que a fila guarde lotes de contatos sem depender de uma linha do Painel.
2. Gerar o Prisma Client (`npx prisma generate`, já executado no Dockerfile).
3. Manter `CRM_API_URL` e `CRM_API_KEY` configurados. A importação ainda usa `LEADS_SOURCE_DIR` e `ETL_TOKEN` no processador existente.
4. O worker inicia automaticamente no servidor Node em produção. `CRM_DELIVERY_WORKER_ENABLED=false` o desativa. Para desenvolvimento, ele só inicia com `CRM_DELIVERY_WORKER_ENABLED=true`.

Para bancos com migrations anteriores já registradas, usar `npx prisma migrate deploy` no ambiente de deploy. Não executar `migrate reset` ou `db push --accept-data-loss`. Se o banco existente foi montado manualmente, reconciliar o histórico de migrations antes de usar `migrate deploy`.

Os testes com mocks não criam contatos ou negócios reais. Executar: `node --test scripts/test-import-mapping.cjs` e `npx tsc --noEmit --incremental false`.
