import { redirect } from 'next/navigation'
import { requireProfessional } from '@/lib/auth'
import { PRO_HOME } from '@/lib/professionals/model'

export const dynamic = 'force-dynamic'

/** BL-168: each professional lands on their own home. */
export default async function ProHome() {
  const { role } = await requireProfessional()
  redirect(PRO_HOME[role])
}
