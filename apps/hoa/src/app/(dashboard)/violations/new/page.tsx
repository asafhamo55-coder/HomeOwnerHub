import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@homeownerhub/ui'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { Wizard } from './Wizard'

export const metadata = { title: 'New violation' }

interface PropertyOption {
  id: string
  address: string
  unit_number: string | null
}

export default async function NewViolationPage() {
  const supabase = await getSupabaseServerClient()

  const [propsRes, ccrRes] = await Promise.all([
    supabase
      .from('hoa_properties')
      .select('id, address, unit_number')
      .order('address', { ascending: true }),
    supabase
      .from('hoa_documents')
      .select('id', { count: 'exact', head: true })
      .eq('type', 'ccr')
      .not('parsed_text', 'is', null),
  ])

  const properties = (propsRes.data ?? []) as PropertyOption[]
  const hasParsedCCR = (ccrRes.count ?? 0) > 0

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/violations"
        className="inline-flex items-center gap-1 text-sm font-medium text-muted-fg hover:text-muted"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to violations
      </Link>

      <Card variant="elevated">
        <CardHeader>
          <CardTitle>Report a violation</CardTitle>
        </CardHeader>
        <CardContent>
          <Wizard properties={properties} hasParsedCCR={hasParsedCCR} />
        </CardContent>
      </Card>
    </div>
  )
}
