import { supabaseAdmin, getCallerProfile, isAdminOrOwner } from '../_lib/auth.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido.' })
  }

  const caller = await getCallerProfile(req)
  if (!isAdminOrOwner(caller)) {
    return res.status(403).json({ error: 'Sem permissão para criar usuários.' })
  }

  const { nome, email, senha, role } = req.body || {}

  if (!nome || !email || !senha || senha.length < 8) {
    return res.status(400).json({ error: 'Preencha nome, e-mail e uma senha com 8+ caracteres.' })
  }
  if (!['user', 'admin', 'comercial', 'expedicao'].includes(role)) {
    return res.status(400).json({ error: 'Perfil inválido.' })
  }
  // Somente owner pode criar outro admin.
  if (role === 'admin' && caller.role !== 'owner') {
    return res.status(403).json({ error: 'Apenas o proprietário pode criar administradores.' })
  }

  const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
  })
  if (createError) {
    return res.status(400).json({ error: createError.message })
  }

  const { error: perfilError } = await supabaseAdmin.from('perfis').upsert({
    id: created.user.id,
    nome,
    email,
    role,
    deve_trocar_senha: true,
  }, { onConflict: 'id' })
  if (perfilError) {
    // Reverte a criação no Auth se o perfil não puder ser criado, para não deixar usuário órfão.
    await supabaseAdmin.auth.admin.deleteUser(created.user.id)
    return res.status(400).json({ error: perfilError.message })
  }

  return res.status(200).json({ id: created.user.id })
}
