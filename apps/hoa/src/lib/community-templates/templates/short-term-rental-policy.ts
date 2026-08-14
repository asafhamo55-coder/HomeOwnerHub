import type { CommunityTemplate } from '../types'

const template: CommunityTemplate = {
  slug: 'short-term-rental-policy',
  name: 'Short-Term Rentals — What the Documents Allow',
  description:
    'A statement of the association\'s short-term rental position, sent community-wide so owners considering listing find out before they book guests rather than after. Pairs with the lease cap template.',
  genre: 'governance',
  shape: 'notice',
  audience: 'broadcast',
  accentColor: '#7A5A1F',
  visual: {
    kind: 'illustration',
    asset: 'short-term-rental-policy.png',
    alt: 'A door key with a looped handle, as handed to a tenant',
  },
  subject: 'Short-term rentals in {{association_name}}',
  preview: 'What the governing documents allow, and what to do before listing.',
  body: [
    { type: 'paragraph', text: 'Hi {{recipient_name}},' },
    {
      type: 'paragraph',
      text: 'Short-term rentals come up regularly, so here is the association\'s position in one place — sent to every owner, not prompted by any particular listing.',
    },
    { type: 'visual' },
    {
      type: 'callout',
      text: '{{policy_summary}}',
    },
    {
      type: 'paragraph',
      text: 'If you are considering renting your home, {{owner_next_step}}',
    },
    {
      type: 'paragraph',
      text: 'A practical note: whatever the association\'s rules, your mortgage, your insurer and the county may each have their own position on short-term rentals, and those are not the association\'s to waive. Check all three before you list.',
    },
  ],
  questions: [
    {
      id: 'policy_summary',
      label: 'What do the documents actually say?',
      type: 'textarea',
      required: true,
      help: 'Quote or closely paraphrase the leasing provision, including any minimum lease term. If the documents are genuinely silent or ambiguous, say so plainly rather than stating a position the board wishes were true.',
    },
    {
      id: 'owner_next_step',
      label: 'What should an owner do first?',
      type: 'textarea',
      required: true,
      help: 'e.g. "please contact the board before listing, so we can confirm whether the lease cap has room and register the tenancy."',
    },
  ],
  legalNote:
    'This is the template most likely to be quoted back at the board in a dispute, so it must reflect what the documents say rather than what the board prefers. A restriction that was never properly adopted, or that was adopted after an owner bought, may not be enforceable against that owner — several states limit retroactive rental restrictions, and Georgia associations should have counsel confirm both the adoption history and whether existing owners are grandfathered before this goes out. Do not announce a new restriction here: amending leasing rights normally requires an owner vote at the threshold in the declaration, and an email cannot create the restriction. Do not name an owner, an address or a listing. Note that housing providers cannot refuse tenants on protected grounds, so keep any tenant-related language to lease term and registration, never to who the tenant is.',
}

export default template
