import { HubSwitcher, OTHER_HUBS_ENABLED, type Hub } from '@homeowner-portal/ui'
import type { UserHub } from '@/lib/orgs'
import { appOrigin } from '@/lib/app-origin'

interface Props {
  userHubs: UserHub[]
}

// Hub URLs come from env so dev (localhost) and prod (subdomains) both work
// without code changes. Each app imports this component and only it knows
// which hub is "current" — that's set per-app, not per-user.
export function HoaHubSwitcher({ userHubs }: Props) {
  // BL-097: PM and Eviction are not offered, so HOA is the only hub and
  // there is nothing to switch to.
  if (!OTHER_HUBS_ENABLED) return null

  const hubs: Hub[] = [
    {
      type: 'hoa',
      label: 'HOA Hub',
      url: appOrigin(),
      orgName: userHubs.find((h) => h.type === 'hoa')?.orgName,
    },
    {
      type: 'eviction',
      label: 'Eviction Hub',
      url: process.env.NEXT_PUBLIC_EVICTION_URL ?? 'http://localhost:3001',
      orgName: userHubs.find((h) => h.type === 'eviction')?.orgName,
    },
    {
      type: 'pm',
      label: 'PM Hub',
      url: process.env.NEXT_PUBLIC_PM_URL ?? 'http://localhost:3002',
      orgName: userHubs.find((h) => h.type === 'pm')?.orgName,
    },
  ]

  return <HubSwitcher current="hoa" hubs={hubs} />
}
