import { supabaseAdmin, getCallerProfile, isAdminOrOwner } from '../_lib/auth.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido.' })
  }

  const caller = await getCallerProfile(req)
  if (!isAdminOrOwner(caller)) {
    return res.status(403).json({ error: 'Sem permissão para redefinir senhas.' })
  }

  const { userId, novaSenha } = req.body || {}
  if (!userId || !novaSenha || novaSenha.length < 8) {
    return res.status(400).json({ error: 'Informe o usuário e uma senha com 8+ caracteres.' })
  }

  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    password: novaSenha,
  })
  if (updateError) {
    return res.status(400).json({ error: updateError.message })
  }

  const { error: perfilError } = await supabaseAdmin
    .from('perfis')
    .update({ deve_trocar_senha: true, solicitou_reset_senha: false })
    .eq('id', userId)
  if (perfilError) {
    return res.status(400).json({ error: perfilError.message })
  }

  return res.status(200).json({ ok: true })
}
