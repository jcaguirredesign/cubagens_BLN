# Funções serverless — nota de reconstrução

Estas 4 funções (`admin/criar-usuario`, `admin/redefinir-senha`, `admin/deletar-usuario`,
`auth/esqueci-senha`) estavam ativas em produção, mas **nunca haviam sido commitadas** neste
repositório (deploy feito direto via CLI/API da Vercel, fora do fluxo Git).

O código aqui foi **reconstruído** a partir do contrato observado no `index.html` (rotas,
payloads e mensagens de erro esperadas pelo client) e das variáveis de ambiente já configuradas
na Vercel (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`).

**Isso não é uma cópia byte-a-byte do que estava rodando.** Antes do merge, revisar com atenção:

- `criar-usuario`: valida que quem chama é admin/owner; só o owner pode criar outro admin.
- `redefinir-senha`: valida admin/owner; força `deve_trocar_senha=true` no próximo login.
- `deletar-usuario`: restrito ao owner; bloqueia auto-exclusão e exclusão do owner.
- `esqueci-senha`: pública, sem auth; não revela se o e-mail existe (evita enumeração de contas).

Depois do merge, testar manualmente os 4 fluxos em produção antes de considerar este PR "seguro".
