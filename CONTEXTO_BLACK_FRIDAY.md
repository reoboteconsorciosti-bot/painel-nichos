# A história da Black Friday no Painel Nichos

Documento de contexto para continuidade do projeto. Atualizado em **4 de novembro de 2026**, considerando o fuso de Cuiabá.

Este relato descreve a evolução da Black Friday, os incidentes encontrados e a direção escolhida para a integração. Uma alteração existir no código local não significa que já esteja implantada. As verificações de código também não comprovam, por si só, o estado atual dos cadastros em produção.

## 1. O Painel começou como uma ferramenta de distribuição de contatos

O Painel Nichos nasceu para organizar bases de contatos por segmento e permitir que um usuário escolhesse um consultor e gerasse uma lista. Nos nichos comuns, a seleção também envolve estado, cidade e quantidade. O Painel controla quais contatos já foram distribuídos e os limites mensais dos consultores.

Logo apareceram problemas de usabilidade. Em zoom normal do navegador, alguns elementos e formulários ficavam cortados. O usuário também pediu um sistema mais direto: escolher o consultor, informar a quantidade e concluir a operação com clareza. A relação entre o consultor selecionado e o responsável no CRM deveria ser coerente.

A Black Friday apareceu nesse cenário como uma campanha especial. Ela tem uma base própria, um período de atividade e liberações de contatos para consultores. Ao contrário dos nichos regulares, essa base não depende de estado ou cidade. Exigir localização nessa campanha só acrescentava uma barreira sem utilidade.

## 2. A importação precisava aceitar a realidade das planilhas

O fluxo inicial de importação dependia de um modelo mais restrito. O usuário levantou uma necessidade importante: as planilhas reais nem sempre têm as mesmas colunas, e algumas informações precisam compor a descrição do negócio no CRM.

Por isso, a importação ganhou uma etapa de mapeamento. Cada coluna pode ser associada a um campo conhecido, ignorada ou incluída na descrição. Várias colunas podem compor a mesma descrição, preservando o nome da coluna e seu conteúdo. A interface passou a mostrar exemplos antes da confirmação.

Nesse momento também foi investigada a documentação do CRM. Foi confirmado que criar um negócio permite enviar uma descrição. Já o endpoint `PATCH /api/v1/deals/:id` existente tinha um objetivo muito específico: acrescentar uma nota ao final da descrição de um negócio existente, com data e hora. Ele não era uma edição geral do negócio e não alterava responsável nem etapa.

Essa distinção é importante até hoje. Guardar o ID de um negócio e mandar uma nota para ele não equivale a redistribuí-lo para outro consultor.

## 3. Os primeiros incidentes mostraram diferenças entre código e banco

Durante a evolução da importação, apareceram erros de produção relacionados a colunas esperadas pelo Prisma, mas ausentes no banco, incluindo `email` em leads e `idempotency_key` na fila de entregas ao CRM.

Esses incidentes mostraram que alterar o schema e gerar o cliente Prisma durante o build não aplica, automaticamente, todas as migrações ao banco de produção. A implantação precisa considerar tanto o código quanto as migrações necessárias.

Outra discussão foi sobre duplicidade. Uma planilha pode conter contatos que já existem no Painel ou no CRM. Isso não deve impedir o processamento do restante da lista nem tornar o lote inteiro inválido. Ao mesmo tempo, a contagem de novos registros precisa representar o que efetivamente entrou no Painel.

A regra construída para o Painel preserva contatos existentes e evita recriar a mesma ocorrência do telefone. Isso não significa que o CRM deva rejeitar toda a operação por já conhecer aquele contato. Encontrar alguém já cadastrado deveria ajudar a vincular a operação ao cadastro correto.

## 4. Surgiu a necessidade de histórico e desimportação

O usuário pediu uma forma simples de desfazer uma importação e consultar os lotes anteriores. Foi criado um histórico de importações, com identificação do arquivo, destino, quantidade e registros associados ao lote.

A primeira base da Black Friday, porém, havia sido importada antes desse histórico. Portanto, o sistema não tinha como reconstruir perfeitamente o lote antigo apenas a partir de um histórico que ainda não existia. O usuário esclareceu que queria limpar todos os contatos do card da Black para importar novamente com as regras atualizadas.

Essa experiência estabeleceu uma distinção importante: desfazer uma importação no Painel e desfazer alterações no CRM são operações diferentes. Apagar ou desimportar dados locais não desfaz automaticamente contatos ou negócios já criados no CRM. Também não deve apagar o histórico de auditoria sobre o que aconteceu.

## 5. O incidente mais sério foi o envio não desejado para o CRM

Em seguida, a tela passou a mostrar contagens de sincronização: solicitações concluídas, na fila e com problemas. O usuário disse que ainda não havia pedido aquele envio, mas percebeu que o CRM estava recebendo muitos negócios.

Isso tornou o problema concreto: não era apenas uma mensagem confusa na interface. Houve negócios criados no CRM sem corresponder à intenção do usuário naquele momento. O problema foi relatado como uma remessa de mais de cem negócios da Black Friday e exigiu contenção e conferência dos registros.

Durante o atendimento do incidente foi registrada uma fotografia da fila com solicitações já concluídas, solicitações com resultado incerto e milhares de solicitações pendentes canceladas. Houve um levantamento com 195 solicitações POST concluídas e 10 com resultado incerto, além do cancelamento de 2.300 solicitações pendentes de importação. Esses números são uma fotografia daquele atendimento, **não uma contagem atual do CRM, nem uma garantia de quantidade de contatos distintos**. Chamadas de lote e criação de negócios têm efeitos diferentes.

Foi preparado um manifesto dos negócios identificados para auxiliar a conferência. O usuário informou que estava trabalhando com o Claude, que tinha acesso direto ao projeto do CRM, para remover os negócios criados indevidamente. O Painel não deve presumir que toda a limpeza foi concluída sem uma confirmação do lado do CRM.

O incidente também ensinou que HTTP 500 ou timeout não provam, sozinhos, que nada foi gravado. Um servidor pode concluir a alteração e falhar antes de devolver a resposta. Repetir automaticamente uma criação nessa situação pode gerar duplicidade.

## 6. A autorização explícita para enviar ao CRM virou uma regra central

O usuário reforçou várias vezes: **nada deve ir para o CRM enquanto ele não mandar**.

A importação comum foi ajustada para começar com o envio ao CRM desmarcado. Também foi encontrado um detalhe na Black Friday: sua janela abria com o envio marcado. Esse padrão foi alterado para desmarcado a cada abertura.

Abrir o card, consultar disponibilidade, importar a base ou liberar leads apenas no Painel não deve ser interpretado como autorização para criar ou atualizar registros no CRM. Consultar membros do time para montar uma lista de consultores é uma leitura; enviar contatos ou alterar negócios é outra ação, que exige confirmação explícita no fluxo.

Na direção mais recente da Black, a própria importação da campanha fica restrita ao Painel. A solicitação de atualização no CRM acontece na distribuição para o consultor, quando o usuário marca a opção e escolhe a etapa de destino.

## 7. Responsável do negócio e responsável do contato são campos diferentes

O usuário percebeu que um negócio podia aparecer no nome do consultor escolhido enquanto o contato continuava com outro responsável. Isso não era apenas um problema de exibição: o CRM guarda essas atribuições em campos diferentes.

Foi conferido que o envio comum de um contato com `ownerId` segue uma regra de preservação no CRM: um contato que já tem responsável não é transferido simplesmente porque uma integração reenviou outro `ownerId`. Essa regra evita que um reenvio comum roube a carteira de alguém.

Também foi localizada uma operação específica para transferir o responsável de um contato, `PATCH /api/v1/contacts/:id/owner`. Ela tem regras próprias de elegibilidade e não atualiza o responsável ou a etapa dos negócios existentes.

Portanto, não se deve afirmar que todos os responsáveis do incidente ficaram intactos sem auditoria dos registros reais. Contatos já atribuídos podem ter sido preservados pelo fluxo comum; contatos novos ou antes sem responsável podem ter recebido uma atribuição. A confirmação de cada caso depende do estado e dos registros do CRM.

A decisão de produto para a Black é que a redistribuição intencional mantenha contato e negócio coerentes: o consultor selecionado deve passar a responder pelos dois, respeitando as permissões e os conflitos identificados no CRM.

## 8. A liberação da Black também encontrou problemas no bloqueio de concorrência

O erro `failed_to_assign_leads` apareceu na interface. Inicialmente, ele era apenas uma mensagem genérica do endpoint, que escondia a exceção real. Os logs do Easypanel trouxeram a causa concreta.

O primeiro erro era:

```text
function pg_advisory_xact_lock(bigint, integer) does not exist
```

A chamada queria usar o bloqueio de duas chaves inteiras, mas o parâmetro enviado pelo Prisma chegava como `bigint`. Foram acrescentadas conversões explícitas para `integer`, mantendo a chave compartilhada com a geração normal de listas.

Depois apareceu outro erro:

```text
Failed to deserialize column of type 'void'
```

A função de bloqueio retorna `void`, e o Prisma tentava desserializar esse retorno bruto. A consulta passou a retornar uma expressão booleana, com `IS NULL`, em vez de expor o `void`. O mesmo padrão foi aplicado aos outros usos desse bloqueio nas listas e nas cotas.

Nesses erros específicos, a falha ocorreu no começo da transação, antes de gravar as liberações e a fila do CRM. Isso permite concluir que aquelas tentativas que falharam exatamente nesse ponto não enfileiraram o envio. Essa conclusão não deve ser generalizada para qualquer outro HTTP 500.

Também foi retirada uma dependência desnecessária: para liberar apenas no Painel, o POST pode validar o consultor nos registros locais já sincronizados, em vez de depender de uma nova consulta ao CRM naquele instante.

## 9. A auditoria de distribuição passou a fazer parte do projeto

Depois dos incidentes, o usuário pediu um histórico para saber quem estava tirando listas, para qual consultor e de qual nicho.

Foi implementado um registro de distribuição com solicitante, consultor, nicho, quantidade, data, localização quando aplicável e indicação de que o envio ao CRM foi ou não solicitado. As listas normais e as liberações da Black Friday entram nesse histórico.

O registro é criado na mesma transação da distribuição. Uma liberação cancelada por erro não deve deixar um evento dizendo que ela foi concluída. Os administradores podem ver o histórico global; supervisores têm acesso aos próprios eventos.

Os registros antigos não guardavam todos esses dados, principalmente a identidade exata de quem solicitou. Não seria correto preencher esse passado inventando um solicitante a partir do supervisor da equipe do consultor. O histórico confiável começa com a implantação do recurso e da migração correspondente.

## 10. A discussão do regex revelou um problema de integração maior

O usuário pediu uma validação que ajudasse a corrigir formatos recuperáveis, em vez de simplesmente barrar ou ignorar contatos. Foram revistas regras de telefones, prefixos, notação científica de planilhas, ramais e sugestões de mapeamento.

Um exemplo trouxe o problema para a Black: o CRM avisou que o WhatsApp `0624250000` havia sido ignorado porque o DDD `06` não existe. O usuário explicou que era necessário remover o zero inicial e depois informou como referência original `55624250000`, observando que o número poderia ser fixo e já existia no CRM.

Esse caso mostrou por que não basta dizer que todo telefone deve virar um celular moderno. Remover o zero de `0624250000` resulta em `624250000`, que tem nove dígitos. Isso não autoriza inventar um dígito para completar o cadastro. Porém, pode ser uma chave válida para **encontrar um registro legado já existente**, inclusive uma forma antiga de telefone fixo.

Também foi encontrado que parte do envio usava o telefone bruto salvo no banco, sem aplicar as correções da importação. Atualizar a importação não reprocessa automaticamente todos os registros antigos nem todos os payloads já gravados na fila.

O usuário rejeitou uma solução que enviasse apenas nome e negócio, deixando o número para trás. A necessidade real é preservar o vínculo com o cadastro que já tem aquele telefone no CRM.

## 11. Conferir o código do CRM explicou a criação de contatos sem número

Foi consultada a documentação pública e foi possível ler o código do repositório `gabrielferreiraz/crmreobote`.

No fluxo externo de criação/atualização de contato, o CRM primeiro normaliza e valida os números recebidos. Só depois procura um contato correspondente usando os valores normalizados aprovados. Se o Painel envia apenas `whatsapp` e esse valor é rejeitado, a busca pode ficar sem uma chave utilizável. Como o nome permite criar o contato, a operação pode terminar com um novo cadastro sem aquele número e um novo negócio vinculado a ele.

Isso explica o risco do comportamento observado. Não é uma prova retroativa de quais registros específicos foram afetados em produção; essa conferência ainda depende dos dados e da auditoria reais.

O CRM também diferencia o campo genérico de telefone do campo WhatsApp. As regras implementadas para WhatsApp são mais restritas. Por isso, tratar todo número de uma exportação histórica como um novo WhatsApp a ser validado pode descartar a informação que permitiria encontrar o contato original.

Foi confirmado que criar um negócio aceita `contactId`. Porém, esse caminho ainda cria **outro negócio**. Ele resolve o vínculo com o contato, mas não atende ao novo objetivo de reutilizar o negócio antigo.

## 12. A decisão mudou: a Black deve redistribuir os negócios que já existem

O usuário propôs um caminho mais simples para a base antiga: o Painel deve trocar o responsável do contato e do negócio e atualizar a etapa, aproveitando os registros que já existem no CRM.

Essa decisão mudou o propósito da integração da Black. Para essa base, ela deixa de ser um fluxo de criação de novos contatos e negócios e passa a ser um fluxo de **localização e redistribuição**.

Surgiu então a questão dos IDs. O usuário não quer descobrir o ID de contato e negócio manualmente para cada linha. A solução acordada foi localizar automaticamente pelo telefone ou WhatsApp, obter os IDs dentro do CRM e usar esses registros na atualização.

Se uma exportação já trouxer o ID do negócio, ele pode ajudar a identificar o registro certo. Mas o fluxo geral não deve exigir uma coleta manual de IDs. A busca por telefone precisa funcionar para toda a lista, não como uma exceção feita apenas para um número.

## 13. O plano revisado de redistribuição

O Painel envia uma solicitação explícita com o telefone original, a campanha, o usuário que solicitou, o consultor selecionado, o funil e a etapa escolhidos. A opção de integração começa desmarcada.

O CRM busca o número nos campos de telefone e WhatsApp. Considera variantes justificadas por formatação, DDI brasileiro, zero inicial, prefixo de operadora e nono dígito de celular. Para números antigos, essas variantes são usadas somente na consulta. Elas não reescrevem os telefones já cadastrados e não acrescentam um dígito arbitrário ao registro.

Encontrado um único contato, o CRM procura o negócio aberto ou perdido no funil informado. Um ID de negócio conhecido pode restringir essa procura, desde que pertença ao mesmo contato. Encontrar vários contatos ou vários negócios elegíveis é uma ambiguidade; escolher o primeiro ou o mais recente sem outra regra poderia transferir a pessoa errada.

Sem correspondência ou com ambiguidade, o item fica identificado para revisão. Não existe fallback automático que crie outro contato ou negócio. Negócios ganhos ficam protegidos. Negócios perdidos só são reabertos mediante uma opção explícita da solicitação.

O CRM valida a identidade ativa do solicitante, o consultor de destino e os escopos de equipe. Um supervisor não ganha autorização geral sobre a carteira de outra equipe por usar o Painel. Transferências fora do seu escopo precisam respeitar a regra de elegibilidade já existente ou ser tratadas por quem tem permissão no CRM.

O CRM também confere os campos obrigatórios da etapa. Se o contato tiver outro negócio aberto ou ganho com outro responsável, a transferência requer revisão, porque trocar o responsável do contato poderia afetar o acompanhamento desse outro negócio.

Passadas as validações, a alteração do responsável do contato, do responsável do negócio, da etapa e a auditoria são gravadas na mesma transação. Falhar no meio cancela o conjunto. Os telefones, nome, descrição, valores e o histórico do cadastro original são preservados.

## 14. Repetição de requisições e duplicidade da campanha

Cada solicitação recebe um identificador estável. O CRM guarda seu resultado. Se a mesma solicitação for repetida após timeout, devolve o resultado registrado sem executar a transferência novamente. Se o identificador for reutilizado com outros dados, a operação precisa ser recusada para conferência.

Há também uma proteção por contato e campanha. A mesma pessoa pode aparecer na planilha com DDI, sem DDI ou com zero inicial e acabar tendo mais de uma representação no Painel. Isso não pode resultar em duas distribuições do mesmo contato no CRM durante a campanha.

A auditoria do CRM guarda os IDs encontrados e os valores de antes e depois. A auditoria do Painel registra quem pediu a distribuição e para qual consultor. São registros complementares: um descreve o pedido; o outro comprova a alteração efetivada no sistema de origem.

## 15. Estado da implementação em 4 de novembro de 2026

As mudanças estão sendo desenvolvidas em dois lugares. O Painel está no workspace `painel-nichos`. A parte do CRM foi preparada em um checkout temporário e isolado do repositório, para permitir revisão sem alterar diretamente a branch principal nem produção.

No Painel, a Black foi adaptada para gerar solicitações do tipo `REDISTRIBUTE`. O formulário exige a escolha de funil e etapa quando o envio é marcado e oferece uma autorização separada para reabrir negócios perdidos. A importação da campanha foi restringida ao Painel. A importação de telefones da campanha está sendo ajustada para preservar números legados como chaves de busca.

O worker foi adaptado para chamar o endpoint de redistribuição. Solicitações antigas de campanha que ainda tentariam criar contatos ou negócios são encaminhadas para revisão. Elas não devem ser convertidas ou reenviadas silenciosamente. O histórico de solicitações já concluídas também não deve ser repetido automaticamente.

No checkout do CRM foram preparados os endpoints `GET /api/v1/painel-nichos/stages` e `POST /api/v1/painel-nichos/redistributions`, com busca por variantes de telefone, validação de escopo, transação, auditoria, proteção de repetição e proteção por contato/campanha. Essa nova operação não usa os caminhos de criação de contato ou negócio.

A ativação é deliberada. O CRM usa `PAINEL_NICHOS_REASSIGN_API_KEY_ID` para autorizar uma chave específica para essa operação. O Painel usa `CRM_EXISTING_DEALS_ENABLED=true` para habilitar o fluxo. A existência dessas opções no código não significa que elas tenham sido configuradas em produção.

Os testes novos do CRM passaram em 19 cenários com dependências de banco simuladas, incluindo número legado, preservação dos dados, repetição da solicitação, duplicidade na campanha, ambiguidades, permissões e falha de auditoria. A checagem de tipos do checkout do CRM também passou após gerar os tipos das rotas e o cliente Prisma usando uma URL local fictícia, sem acessar produção.

No Painel, os seis testes novos do fluxo de redistribuição passaram. Ao rodar a suíte antiga de importação junto com eles, apareceram inicialmente cinco falhas. Os mocks e expectativas ainda eram anteriores às permissões de dono, à auditoria e à mudança da Black de criação para redistribuição. Esses testes foram atualizados para as regras atuais, sem abrir mão das verificações de permissão e transação. A nova execução concluiu **21 testes do Painel com sucesso**, incluindo os novos e os antigos. A checagem de TypeScript do Painel também passou.

Até este ponto do relato, a parte nova do CRM ainda não foi publicada em uma PR nem implantada. O arquivo `CRM_REDISTRIBUICAO.patch` preserva os novos endpoints, a lógica de redistribuição, a documentação de ativação e os testes do checkout isolado. Ele deve ser aplicado e revisado no repositório do CRM. A implementação dos dois lados passou pelas verificações locais descritas, mas ainda precisa de um ensaio de homologação com PostgreSQL e RLS reais antes da ativação em produção. Nenhuma verificação citada acima enviou contatos ou negócios reais ao CRM.

O pedido é assíncrono entre os sistemas: o Painel grava a liberação local e a solicitação na fila; depois o CRM processa a atualização. A transação única citada neste documento garante os campos e a auditoria **dentro do CRM**. Ela não é uma transação distribuída entre os dois bancos. Por isso, um lead pode estar liberado localmente e continuar aguardando atualização ou revisão no CRM, situação que deve ficar visível na interface.

### Atualização de 5 de novembro de 2026

O patch foi aplicado no repositório do CRM. O Painel ganhou a regra de que um lead distribuído não volta: a liberação compara a chave `campaignPhoneKey` com todas as reservas de qualquer edição, sob o mesmo bloqueio da distribuição, sem migração de banco. Desfazer uma importação não apaga mais reservas nem leads distribuídos. A recusa `CONTACT_ALREADY_DISTRIBUTED` do CRM tem desfecho próprio (`skipped` na fila, `already_distributed` na reserva), e o motivo de cada falha aparece na lista de liberações. 

Por decisão do usuário, as variáveis `PAINEL_NICHOS_REASSIGN_API_KEY_ID` e `CRM_EXISTING_DEALS_ENABLED` foram removidas: a marcação na liberação é a autorização, e o CRM aceita qualquer chave válida da organização, conferindo o solicitante a cada chamada. Também por decisão do usuário, foi criado um último recurso que substitui a regra anterior de nunca criar: com uma opção própria marcada, o CRM cria o negócio quando nada é encontrado, sob as travas descritas em `BLACK_FRIDAY.md` e com limite de 20 criações por dia. Trechos anteriores deste relato sobre essas variáveis e sobre "não criar" descrevem o histórico. O primeiro envio deve ser pequeno, porque o fluxo ainda não rodou com PostgreSQL e RLS reais.

Depois, a tela foi simplificada a pedido do usuário: abrir o card, escolher o consultor, informar a quantidade e clicar em **Importar no CRM**. Esse clique substitui a antiga opção de marcar, que foi removida, e a tela não libera mais lead só no Painel. O destino é definido automaticamente, e funil, etapa e opções não aparecem para o supervisor nem são aceitos pela API. Também a pedido do usuário, o sistema passou a decidir sozinho os problemas identificados em vez de pedir revisão: reabre perdidos, cria como último recurso sob as travas do CRM escolhe entre cadastros e negócios repetidos, entrega negócios perdidos de outras equipes e repõe leads recusados, como descrito em `BLACK_FRIDAY.md`. Respostas incertas agora são repetidas por até 10 minutos, porque o recibo do CRM impede aplicar duas vezes a mesma solicitação, e o lead aberto de outra equipe volta à distribuição. Trechos anteriores sobre autorização à parte, sobre ambiguidade ficar para revisão e sobre nunca reenviar resultado incerto descrevem o histórico.

## 16. Como enxergamos o projeto daqui para frente

A Black deve funcionar como uma ferramenta de distribuição supervisionada de uma carteira já existente. O CRM continua sendo a referência para a identidade do contato, seus negócios e seu histórico. O Painel organiza o pedido, a quantidade e o consultor; o CRM decide quais registros correspondem e aplica a alteração autorizada.

A experiência desejada é simples: importar a base, escolher o consultor, informar a quantidade e, quando houver autorização para o CRM, selecionar a etapa. As correções de formato e as buscas por IDs devem acontecer automaticamente. O usuário só precisa intervir quando existe uma dúvida real sobre qual cadastro ou negócio deve ser alterado.

O próximo avanço de interface é tornar a revisão desses casos uma fila clara: número sem correspondência, vários contatos, vários negócios, carteira de outra equipe ou campos obrigatórios ausentes. O sistema deve explicar o que impede a atualização e permitir uma decisão rastreável, em vez de esconder o problema em um aviso genérico ou marcar tudo como concluído.

Uma consulta prévia de correspondência, sem escrita, pode ajudar o supervisor a revisar o resultado esperado antes de confirmar lotes maiores. Esse recurso é uma evolução planejada; não deve ser descrito como já implantado.

Outra evolução é consultar e exportar a auditoria de ponta a ponta, incluindo o identificador da solicitação do Painel e a auditoria correspondente no CRM. Um eventual desfazer no CRM precisará conferir se os campos ainda têm os valores colocados por aquela redistribuição. Restaurar cegamente um responsável antigo poderia apagar o trabalho posterior de outra pessoa.

O projeto também precisa consolidar o processo de implantação: migrações necessárias, geração do Prisma, compatibilidade dos endpoints, testes e ativação das opções de integração. A parte nova deve poder ser desativada sem impedir a distribuição local no Painel.

## 17. O que uma próxima pessoa deve preservar

- A importação da Black não é autorização de escrita no CRM.
- A redistribuição só acontece por uma ação explícita de quem usa o Painel.
- Telefone e WhatsApp são campos distintos; um formato legado pode servir para busca mesmo quando não seria aceito como novo WhatsApp.
- Criar contato ou negócio quando a busca falha é o último recurso: exige autorização própria na liberação e passa pelas travas do CRM.
- Os IDs devem ser encontrados automaticamente no CRM, com vínculo confirmado entre contato e negócio.
- Uma ambiguidade precisa ficar visível; não deve ser resolvida escolhendo um cadastro arbitrário.
- Responsável do contato, responsável do negócio, etapa e auditoria devem ser coerentes e gravados atomicamente.
- Repetir uma solicitação não pode repetir a alteração nem duplicar a distribuição na campanha.
- Resultados incertos de envio não autorizam reenvio automático de criações antigas.
- Desimportar dados do Painel não desfaz automaticamente efeitos já ocorridos no CRM.
- Os números de um incidente são fotografias daquele momento; o estado atual exige uma consulta atualizada.
- Logs e documentos compartilhados não devem conter cookies, tokens de sessão, chaves de API ou senhas de banco.

## Referências para continuar

- Projeto do Painel: diretório local `painel-nichos`.
- Código do CRM consultado: `https://github.com/gabrielferreiraz/crmreobote`.
- Documentação pública: `https://crm.reoboteconsorcios.com.br/docs`.
- Contexto de importação: `IMPORTACAO_MAPEAMENTO.md`.
- Instruções atuais da campanha e implantação coordenada: `BLACK_FRIDAY.md`.
- Auditoria do Painel: `DistributionAudit` no schema e a tela de auditoria de listas.
- Nova integração no Painel: `lib/crm-redistribution.ts`, rota da Black Friday e worker de entregas.
- Novos testes do Painel: `scripts/test-crm-redistribution.cjs`.
- Alterações do CRM: `lib/api/painel-redistribution.ts` e `docs/painel-nichos-redistribution.md`, no repositório do CRM.

Este arquivo é um contexto de continuidade. Antes de aplicar alterações em produção, conferir a versão atual dos dois repositórios e o que de fato foi implantado desde esta atualização.
