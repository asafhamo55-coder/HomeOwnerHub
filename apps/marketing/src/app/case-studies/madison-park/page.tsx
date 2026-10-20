import { redirect } from 'next/navigation'

// 2026-10-19 owner-delegated defaults: no customer quote is verified and no
// customer has approved a published case study, so this page no longer
// exists. Old links land on the index, which says case studies will be
// published once a customer approves them.
export default function MadisonParkCase() {
  redirect('/case-studies')
}
