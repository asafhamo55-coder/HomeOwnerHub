import { HubSwitcher, type Hub } from '@homeowner-portal/ui'
import type { UserHub } from '@/lib/orgs'

interface Props {
  userHubs: UserHub[]
}

// Hub URLs come from env so dev (localhost) and prod (subdomains) both work
// without code changes. Each app imports this component and only it knows
// which hub is "current" — that's set per-app, not per-user.
export function HoaHubSwitcher({ userHubs }: Props) {
  const hubs: Hub[] = [
    {
      type: 'hoa',
      label: 'HOA Hub',
      url: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
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
