import { createClient } from '@supabase/supabase-js'

// Cliente com service_role — usado SOMENTE server-side, nunca exposto ao client.
export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

/**
 * Valida o Bearer token do request e retorna o perfil (perfis) do usuário autenticado.
 * Retorna null se o token for inválido/ausente ou o perfil não existir.
 */
export async function getCallerProfile(req) {
  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) return null

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !user) return null

  const { data: perfil, error: perfilError } = await supabaseAdmin
    .from('perfis')
    .select('*')
    .eq('id', user.id)
    .single()
  if (perfilError || !perfil) return null

  return perfil
}

export function isAdminOrOwner(perfil) {
  return !!perfil && (perfil.role === 'admin' || perfil.role === 'owner')
}

export function isOwner(perfil) {
  return !!perfil && perfil.role === 'owner'
}
