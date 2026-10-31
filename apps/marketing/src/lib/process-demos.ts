// Scene lists for the interactive process players (components/site/process-player.tsx).
// Pure data, no JSX, no "@/..." imports: tests import this module.
//
// Truth rule: every scene is a step a board or resident can take in apps/hoa
// today. `proof` names the apps/hoa source file (relative to apps/hoa/src) and
// an exact string it contains, so a test can fail when a screen the demo
// copies is renamed or removed. Card and ACH online payments are not shipped,
// so no scene shows them.

export type ProcessId = 'violations' | 'announcements' | 'arc' | 'dues' | 'ask'

export interface Proof {
  file: string
  text: string
}

export interface Scene {
  /** Shown under the frame. Also the text alternative for the scene. */
  caption: string
  /** How long the scene plays before the next one, in ms. */
  ms: number
  /** Pointer target as [x%, y%] of the app pane. */
  ptr: [number, number]
  /** The pointer clicks at its target. */
  click?: boolean
  proof: Proof
}

export interface ProcessDef {
  id: ProcessId
  /** Accessible name of the whole player. */
  title: string
  /** Path shown in the browser bar. */
  urlPath: string
  scenes: Scene[]
}

const WIZ = '(dashboard)/violations/new/Wizard.tsx'
const COMM = '(dashboard)/communications/new/NewCommunicationWizard.tsx'
const ARC_FORM = 'resident/arc/new/ArcRequestForm.tsx'
const ARC_DECIDE = '(dashboard)/arc/[id]/ArcDecisionForm.tsx'
const DUES = '(dashboard)/dues/page.tsx'
const ASK_ANSWER = '(dashboard)/ai/ask/AskDocsAnswer.tsx'

export const PROCESSES: Record<ProcessId, ProcessDef> = {
  violations: {
    id: 'violations',
    title: 'Violation process: photo to approved notice',
    urlPath: '/violations/new',
    scenes: [
      {
        caption: '1. Snap a photo of the problem and add a note',
        ms: 4200,
        ptr: [78, 90],
        click: true,
        proof: { file: WIZ, text: 'Analyze with Covenant Brain' },
      },
      {
        caption: '2. The AI finds the CC&R section and drafts the notice',
        ms: 4200,
        ptr: [50, 55],
        proof: { file: WIZ, text: 'Running Covenant Brain' },
      },
      {
        caption: '3. The board reads the letter and edits the wording',
        ms: 4200,
        ptr: [42, 62],
        proof: { file: WIZ, text: 'Approve before sending' },
      },
      {
        caption: '4. Approve it. The notice is recorded as sent',
        ms: 3600,
        ptr: [72, 90],
        click: true,
        proof: { file: WIZ, text: 'Approve & mark notice sent' },
      },
      {
        caption: '5. The homeowner sees it in their portal, with a fix-by date',
        ms: 4200,
        ptr: [50, 40],
        proof: { file: 'resident/violations/[id]/HomeViolationView.tsx', text: 'Fix by' },
      },
    ],
  },
  announcements: {
    id: 'announcements',
    title: 'Announcement process: write, choose who, preview, send',
    urlPath: '/communications/new',
    scenes: [
      {
        caption: '1. Start from a blank message and pick who gets it',
        ms: 3800,
        ptr: [30, 52],
        click: true,
        proof: { file: COMM, text: 'label="Audience"' },
      },
      {
        caption: '2. Write the message, or let the AI draft it from a sentence',
        ms: 4600,
        ptr: [45, 56],
        proof: { file: COMM, text: 'Drafted for you. Check it before sending.' },
      },
      {
        caption: '3. Preview it the way a phone shows it',
        ms: 3800,
        ptr: [74, 88],
        click: true,
        proof: { file: COMM, text: 'Review & send' },
      },
      {
        caption: '4. Confirm before it goes to every home',
        ms: 3800,
        ptr: [64, 70],
        click: true,
        proof: { file: '(dashboard)/communications/new/send-confirm.ts', text: 'Send to ${who} by ${by}?' },
      },
      {
        caption: '5. Sent. See who received it and who opened it',
        ms: 4200,
        ptr: [50, 30],
        proof: { file: '(dashboard)/communications/[id]/page.tsx', text: "label: 'Opened'" },
      },
    ],
  },
  arc: {
    id: 'arc',
    title: 'Architecture request process: submit, pre-check, decide, notify',
    urlPath: '/resident/arc/new',
    scenes: [
      {
        caption: '1. A resident describes the fence and adds a photo',
        ms: 4200,
        ptr: [30, 86],
        click: true,
        proof: { file: ARC_FORM, text: 'Check my request against the rules' },
      },
      {
        caption: '2. The request is checked against your rules before it is sent',
        ms: 4200,
        ptr: [74, 90],
        click: true,
        proof: { file: ARC_FORM, text: 'Submit application' },
      },
      {
        caption: '3. The board sees how many days are left to decide',
        ms: 3800,
        ptr: [80, 24],
        proof: { file: '(dashboard)/arc/page.tsx', text: "header: 'Decide by'" },
      },
      {
        caption: '4. Approve it, with the conditions in the note',
        ms: 4200,
        ptr: [74, 88],
        click: true,
        proof: { file: ARC_DECIDE, text: 'Approve this request?' },
      },
      {
        caption: '5. Confirm, and the resident gets a decision letter',
        ms: 4600,
        ptr: [70, 70],
        click: true,
        proof: { file: 'lib/resident-notify/render.ts', text: 'Your ARC application was approved with conditions' },
      },
    ],
  },
  dues: {
    id: 'dues',
    title: 'Dues process: generate, see who is behind, record a payment',
    urlPath: '/dues',
    scenes: [
      {
        caption: '1. Generate this month’s dues, with a preview first',
        ms: 4400,
        ptr: [74, 80],
        click: true,
        proof: { file: '(dashboard)/dues/MaterializeButton.tsx', text: 'Generate dues' },
      },
      {
        caption: '2. The dashboard shows who is behind',
        ms: 3800,
        ptr: [30, 28],
        proof: { file: DUES, text: 'label="Properties behind"' },
      },
      {
        caption: '3. Record the payment a homeowner sent',
        ms: 4000,
        ptr: [74, 80],
        click: true,
        proof: { file: '(dashboard)/dues/RecordPaymentButton.tsx', text: 'Show the split' },
      },
      {
        caption: '4. The owner’s ledger updates to paid in full',
        ms: 4000,
        ptr: [50, 45],
        proof: { file: DUES, text: 'label="Paid in full"' },
      },
    ],
  },
  ask: {
    id: 'ask',
    title: 'Ask your documents: question, cited answer, source',
    urlPath: '/ai/ask',
    scenes: [
      {
        caption: '1. Type a rule question in plain English',
        ms: 3800,
        ptr: [45, 28],
        proof: { file: '(dashboard)/ai/ask/AskDocsClient.tsx', text: 'Ask about your governing documents' },
      },
      {
        caption: '2. The answer names the section it came from',
        ms: 4400,
        ptr: [40, 60],
        proof: { file: ASK_ANSWER, text: 'citationsLabel="Cited sections"' },
      },
      {
        caption: '3. Each answer lists the document and section to check',
        ms: 4000,
        ptr: [30, 82],
        proof: { file: ASK_ANSWER, text: 'GOVERNING_TYPE_LABELS' },
      },
      {
        caption: '4. Ask about the books and it answers from your records',
        ms: 4400,
        ptr: [45, 28],
        proof: { file: ASK_ANSWER, text: 'Answered from your records' },
      },
    ],
  },
}

export const PROCESS_ORDER: ProcessId[] = ['violations', 'announcements', 'arc', 'dues', 'ask']
