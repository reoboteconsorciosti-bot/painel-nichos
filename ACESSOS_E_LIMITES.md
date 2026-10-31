# Acessos, visibilidade e limite mensal

- O perfil `OWNER` do CRM recebe o papel de administrador no painel. O perfil `SUPERVISOR` vê apenas a própria equipe. `MANAGER` e `MEMBER` não recebem sessão de acesso ao painel; membros ativos `MEMBER` de vendas continuam disponíveis para seleção como consultores.
- Somente a sessão de proprietário autenticada pelo CRM pode alterar limites e a permissão de visibilidade dos totais globais para supervisores. A visibilidade fica ligada por padrão para preservar o comportamento atual; o proprietário pode desligá-la no painel administrativo.
- O limite mensal padrão é 300 leads por consultor. O proprietário pode alterar esse limite individualmente ou zerar o contador daquele mês.
- Zerar o contador não apaga listas nem vínculos `ListaLead`; os leads já entregues continuam marcados como usados e não voltam para o início da base ou para a fila global.
- Os antigos endpoints de reset global agora respondem `410 global_reset_disabled`. `RESET_TOKEN` não é mais usado.

## Atualização do banco

O schema adiciona `listas.crm_consultant_id`, `consultant_quotas` e `consultant_monthly_usage`. Aplique a migration `prisma/migrations/20261030_owner_controls_consultant_quotas/migration.sql` no banco antes de publicar a versão do painel e gere o Prisma Client durante o build/deploy. Não execute o antigo reset global para preparar essa mudança.

As listas anteriores armazenam apenas um índice numérico de consultor, não o ID do usuário CRM. Por isso, no mês da atualização o contador pode usar esse histórico legado como estimativa inicial; os novos registros usam o ID CRM estável. Depois que o proprietário zera o contador individual, os novos consumos ficam vinculados corretamente àquele consultor.
