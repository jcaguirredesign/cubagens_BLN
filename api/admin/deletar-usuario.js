import { supabaseAdmin, getCallerProfile, isOwner } from '../_lib/auth.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido.' })
  }

  const caller = await getCallerProfile(req)
  if (!isOwner(caller)) {
    return res.status(403).json({ error: 'Apenas o proprietário pode excluir usuários.' })
  }

  const { userId } = req.body || {}
  if (!userId) {
    return res.status(400).json({ error: 'Informe o usuário a excluir.' })
  }
  if (userId === caller.id) {
    return res.status(400).json({ error: 'Você não pode excluir seu próprio usuário.' })
  }

  const { data: alvo } = await supabaseAdmin.from('perfis').select('role').eq('id', userId).single()
  if (alvo?.role === 'owner') {
    return res.status(400).json({ error: 'Não é possível excluir o proprietário.' })
  }

  await supabaseAdmin.from('perfis').delete().eq('id', userId)

  const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId)
  if (deleteError) {
    return res.status(400).json({ error: deleteError.message })
  }

  return res.status(200).json({ ok: true })
}
