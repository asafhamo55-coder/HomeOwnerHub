import { ComingSoon } from '@/components/layout/ComingSoon'

export const metadata = { title: 'Meetings' }

export default function MeetingsPage() {
  return (
    <ComingSoon
      title="Meetings"
      week="Week 3"
      description="Paste a meeting transcript, get an AI-summarized minutes draft with attendees, motions, and action items, then approve it through BarBGate before sharing."
    />
  )
}
