# Importação com mapeamento e descrição no CRM

Fluxo: Importar contatos → escolher arquivo e nicho → mapear colunas → conferir a prévia → importar. Não há escrita no banco na etapa de prévia. São aceitos XLSX e CSV, até 20 MB e 5.000 linhas de dados, com seleção de aba e linha de cabeçalho. Cabeçalhos duplicados devem ser corrigidos na origem.

Nome, telefone e estado são necessários no mapeamento; o estado pode ser informado uma vez para toda a planilha. Várias colunas podem usar o destino **Descrição do negócio**: os valores não vazios são unidos com os nomes das colunas, uma informação por linha. Colunas marcadas como **Ignorar** não são importadas. Telefones existentes continuam sendo ignorados: a importação não atualiza nem apaga seus dados.

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

A importação salva os contatos no painel; **não envia ao CRM**. O envio ocorre ao gerar uma lista com **Enviar ao CRM** ativado.

- Sem descrição: mantém o envio de contatos em lote.
- Com descrição e sem ID de negócio: enfileira a criação de um negócio, com o consultor escolhido em `ownerId` do contato e do negócio.
- Com descrição e ID de negócio: enfileira o acréscimo da nota nesse negócio. Não troca seu responsável nem cria outro negócio.
- Na campanha Black Friday, os dados mapeados também são preservados e o envio usa a mesma fila. Novos negócios incluem os dados da campanha e a descrição importada.

A fila é gravada na mesma transação da distribuição. Há uma entrega por lead, protegida por índice único: redistribuir o mesmo lead não recria o negócio ou repete sua nota automaticamente. A aplicação processa a fila em segundo plano, independente da aba do navegador, limitando a aproximadamente uma chamada a cada 2,3 segundos e coordenando réplicas por lock do PostgreSQL. Uma resposta 429 pausa a fila conforme `Retry-After`.

Erros de validação ficam como `failed`. Timeout, falha de rede, resposta ambígua ou erro 5xx ficam como `needs_review`: é necessário conferir o CRM antes de reenviar, porque a API não documenta uma chave de idempotência para criação de negócios ou acréscimo de notas. Pedidos interrompidos por reinício também não são reenviados cegamente. Não há retry automático para resultados incertos. Avisos de responsável são preservados e mostrados no painel.

## Deploy

1. Aplicar a migration `20261103_import_mapping_crm_descriptions` no PostgreSQL **antes de iniciar a nova versão**. O Prisma seleciona os novos campos de leads também nos fluxos existentes.
2. Gerar o Prisma Client (`npx prisma generate`, já executado no Dockerfile).
3. Manter `CRM_API_URL` e `CRM_API_KEY` configurados. A importação ainda usa `LEADS_SOURCE_DIR` e `ETL_TOKEN` no processador existente.
4. O worker inicia automaticamente no servidor Node em produção. `CRM_DELIVERY_WORKER_ENABLED=false` o desativa. Para desenvolvimento, ele só inicia com `CRM_DELIVERY_WORKER_ENABLED=true`.

Para bancos com migrations anteriores já registradas, usar `npx prisma migrate deploy` no ambiente de deploy. Não executar `migrate reset` ou `db push --accept-data-loss`. Se o banco existente foi montado manualmente, reconciliar o histórico de migrations antes de usar `migrate deploy`.

Os testes com mocks não criam contatos ou negócios reais. Executar: `node --test scripts/test-import-mapping.cjs` e `npx tsc --noEmit --incremental false`.
