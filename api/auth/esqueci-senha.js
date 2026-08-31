import { supabaseAdmin } from '../_lib/auth.js'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido.' })
  }

  const { email } = req.body || {}
  if (!email || !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'Informe um e-mail válido.' })
  }

  // Não revelamos se o e-mail existe ou não (evita enumeração de contas).
  // Se existir, apenas marcamos a flag que acende o badge no painel admin.
  await supabaseAdmin
    .from('perfis')
    .update({ solicitou_reset_senha: true })
    .eq('email', email.trim().toLowerCase())

  return res.status(200).json({ ok: true })
}
