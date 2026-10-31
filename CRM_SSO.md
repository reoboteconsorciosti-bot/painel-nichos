# Integração de acesso com o CRM

## Configuração no painel

Configure estas variáveis somente no ambiente do servidor do Painel de Nichos:

- `CRM_API_URL`: URL base do CRM, sem barra no final.
- `CRM_API_KEY`: chave usada pelo painel para consultar `/api/v1/members`.
- `PAINEL_NICHOS_SSO_SECRET`: segredo HMAC exclusivo para a integração com o Painel de Nichos. Configure o mesmo valor no CRM, sem usar prefixo `NEXT_PUBLIC_` ou enviá-lo ao navegador.
- `JWT_SECRET`: segredo local usado para assinar a sessão do painel.

As variáveis existentes do simulador `SIMULADOR_URL` e `SIMULADOR_SSO_SECRET` devem permanecer inalteradas. No CRM, crie configurações separadas:

- `PAINEL_NICHOS_URL`: URL base pública do Painel de Nichos.
- `PAINEL_NICHOS_SSO_SECRET`: mesmo segredo configurado no painel.

O botão **Entrar com o CRM** chama `GET /api/painel-nichos-sso`. Essa rota deve exigir uma sessão autenticada do CRM e redirecionar para:

```text
${PAINEL_NICHOS_URL}/api/auth/crm-sso?crm_sso_token=<token>
```

O token deve usar HMAC-SHA256 com `PAINEL_NICHOS_SSO_SECRET`, validade maxima de 60 segundos e payload com `aud: "painel-nichos"`, `userId`, `email`, `name`, `organizationId`, `iat` e `exp`. O callback valida assinatura, audiencia, validade e situacao/perfil atual do usuario consultado em `/api/v1/members`. Somente `OWNER` recebe perfil de administrador; supervisores ativos de `SALES` recebem acesso a propria equipe. `MANAGER` e `MEMBER` nao recebem sessao administrativa; membros `MEMBER` aparecem como consultores da equipe.

Para implementar a parte do CRM, peça ao Gemini:

> No CRM, mantenha sem alterações as variáveis e rotas atuais do simulador (`SIMULADOR_URL`, `SIMULADOR_SSO_SECRET` e `/api/simulador-sso`). Adicione um SSO separado para o Painel de Nichos, usando as novas variáveis `PAINEL_NICHOS_URL` e `PAINEL_NICHOS_SSO_SECRET`. Crie `GET /api/painel-nichos-sso`, protegido pela sessão autenticada do CRM. A rota deve criar token `<payload_base64url>.<assinatura_hex>` com HMAC-SHA256 e validade de 60 segundos; o payload precisa conter `aud: "painel-nichos"`, `userId`, `email`, `name`, `organizationId`, `iat` e `exp`. Redirecione para `${PAINEL_NICHOS_URL}/api/auth/crm-sso?crm_sso_token=<token>`. Não altere nem sobrescreva a configuração do simulador. Inclua o botão/link de acesso ao painel no CRM e mostre quais arquivos foram alterados. Não revele valores de segredos.

## Equipes e consultores

O painel sincroniza consultores ativos de `SALES` diretamente de `/api/v1/members`. Para uma sessão de supervisor, só entram membros cujo `team.leaderId` seja o ID do supervisor e cujo `teamId` seja o mesmo da sessão. Para mover ou incluir um consultor, atualize o vínculo da equipe no CRM.

As credenciais de supervisores e administradores locais foram removidas do `.env`; o acesso ao painel e feito pelo SSO do CRM. Somente usuarios `OWNER` podem administrar quotas e permissoes de visibilidade.
