import './_load-env'
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
const sb = createClient(url, key, { auth: { persistSession: false } })

async function main() {
  const { data: seed } = await sb
    .from('lease_waiting_list')
    .select('organization_id, association_id, property_id')
    .limit(1)
    .single()
  if (!seed) return console.log('no seed row')

  for (const status of ['withdrawn', 'denied', 'approved']) {
    const { data, error } = await sb
      .from('lease_waiting_list')
      .insert({ ...seed, status, notes: '__probe__' })
      .select('id')
      .single()
    console.log(status, '->', error ? `ERROR: ${error.message}` : 'accepted')
    if (data) await sb.from('lease_waiting_list').delete().eq('id', (data as any).id)
  }
  const { count } = await sb
    .from('lease_waiting_list')
    .select('id', { count: 'exact', head: true })
  console.log('total rows after probe:', count)
}
main()
