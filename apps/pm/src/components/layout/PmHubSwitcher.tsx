import { HubSwitcher, type Hub } from '@homeowner-portal/ui'
import type { UserHub } from '@/lib/orgs'

interface Props {
  userHubs: UserHub[]
}

export function PmHubSwitcher({ userHubs }: Props) {
  const hubs: Hub[] = [
    {
      type: 'hoa',
      label: 'HOA Hub',
      url: process.env.NEXT_PUBLIC_HOA_URL ?? 'http://localhost:3000',
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
      url: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3002',
      orgName: userHubs.find((h) => h.type === 'pm')?.orgName,
    },
  ]

  return <HubSwitcher current="pm" hubs={hubs} />
}
