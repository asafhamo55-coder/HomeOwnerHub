'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  Calculator,
  CalendarDays,
  Download,
  FileText,
  Home,
  Inbox,
  Mail,
  Megaphone,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Settings,
  Trash2,
  Users,
  Wallet,
} from 'lucide-react'
import {
  Alert,
  AppShell,
  AppShellContent,
  AppShellHeader,
  AppShellMain,
  AppShellSearchTrigger,
  AppShellSidebar,
  Avatar,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Checkbox,
  ChoiceGroup,
  CommandPalette,
  BrandMark,
  ConfirmDialog,
  ConfirmProvider,
  DataTable,
  Dialog,
  DialogContent,
  DialogTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  Field,
  Fieldset,
  Input,
  Kpi,
  KeyValue,
  KeyValueList,
  LoadFailed,
  NavItem,
  Page,
  Pager,
  Radio,
  Select,
  Sheet,
  SheetContent,
  SheetTrigger,
  SidebarBrand,
  SidebarCollapseToggle,
  SidebarFooter,
  SidebarNav,
  SidebarSection,
  Skeleton,
  SkeletonText,
  StatCard,
  StatusBadge,
  StatusPill,
  Switch,
  Tab,
  TabGroup,
  TabList,
  TabPanel,
  Tabs,
  Textarea,
  ToastProvider,
  Tooltip,
  UserMenu,
  WizardStepper,
  palette,
  useAppShell,
  useConfirm,
  useToast,
  type PaletteCommand,
} from '@homeowner-portal/ui'

// Every value below is invented demo copy — no real people or addresses.

interface Row {
  id: string
  unit: string
  owner: string
  status: 'paid' | 'overdue' | 'partial' | 'plan'
  due: number
  updated: string
}

const ROWS: Row[] = [
  { id: '1', unit: '101 Demo Court', owner: 'Avery Example', status: 'overdue', due: 1240.5, updated: 'Oct 2' },
  { id: '2', unit: '103 Demo Court', owner: 'Sam Placeholder', status: 'paid', due: 0, updated: 'Oct 1' },
  { id: '3', unit: '7 Sample Way', owner: 'Riley Testcase', status: 'partial', due: 310, updated: 'Sep 28' },
  { id: '4', unit: '12 Sample Way', owner: 'Jordan Fixture', status: 'plan', due: 2875, updated: 'Sep 21' },
  { id: '5', unit: '2 Mock Lane', owner: 'Casey Stub', status: 'paid', due: 0, updated: 'Sep 19' },
]

const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })

const STATUS_TONES = { paid: 'success', overdue: 'danger', partial: 'warning', plan: 'info' } as const
const STATUS_LABELS = { paid: 'Paid', overdue: 'Overdue', partial: 'Partially paid', plan: 'Payment plan' }

const NAV = [
  { label: undefined, items: [{ href: '/ui-gallery', label: 'Dashboard', icon: Home }, { href: '#inbox', label: 'Inbox', icon: Inbox, badge: 4 }] },
  {
    label: 'Community',
    items: [
      { href: '#properties', label: 'Properties', icon: Building2 },
      { href: '#violations', label: 'Violations', icon: AlertTriangle },
      { href: '#meetings', label: 'Meetings', icon: CalendarDays },
      { href: '#communications', label: 'Communications', icon: Megaphone },
    ],
  },
  {
    label: 'Money',
    items: [
      { href: '#dues', label: 'Dues', icon: Wallet },
      { href: '#accounting', label: 'Accounting', icon: Calculator },
    ],
  },
  { label: 'Knowledge', items: [{ href: '#documents', label: 'Documents', icon: FileText }] },
] as const

const COMMANDS: PaletteCommand[] = [
  ...NAV.flatMap((g) =>
    g.items.map((i) => {
      const Icon = i.icon
      return { id: i.href, label: i.label, group: 'Go to', href: i.href, icon: <Icon aria-hidden />, hint: g.label }
    }),
  ),
  { id: 'new-violation', label: 'New violation', group: 'Create', icon: <Plus aria-hidden /> },
  { id: 'new-message', label: 'New message to residents', group: 'Create', icon: <Mail aria-hidden /> },
]

function Section({ id, title, description, children }: { id: string; title: string; description?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 space-y-4" data-gallery-section={id}>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{title}</h2>
        {description ? <p className="text-sm text-muted">{description}</p> : null}
      </div>
      {children}
    </section>
  )
}

function Swatches() {
  const p = palette('hoa', 'light')
  const roles = ['background', 'surface', 'subtle', 'border', 'foreground', 'foreground-secondary', 'muted', 'primary', 'primary-subtle', 'success', 'warning', 'danger', 'info', 'accent'] as const
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
      {roles.map((r) => (
        <div key={r} className="overflow-hidden rounded-lg border border-border bg-surface">
          <div className="h-12 border-b border-border" style={{ background: `hsl(var(--${r}))` }} />
          <div className="px-2.5 py-2">
            <p className="truncate text-xs font-medium text-foreground">{r}</p>
            <p className="num text-xs text-muted">{p[r]}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

function OverlayDriver({ overlay }: { overlay: string | null }) {
  const shell = useAppShell()
  const toast = useToast()
  const confirm = useConfirm()
  useEffect(() => {
    if (overlay === 'palette') shell?.setPaletteOpen(true)
    if (overlay === 'toast') {
      toast({ tone: 'success', message: 'Violation notice sent to 101 Demo Court.' })
      toast({ tone: 'error', title: 'Couldn’t save the budget', message: 'Your changes are still here. Try again in a moment.' })
      toast({ tone: 'info', message: 'Draft saved', action: { label: 'Undo', onClick: () => {} } })
    }
    if (overlay === 'confirm') {
      void confirm({
        title: 'Delete this draft notice?',
        description: 'The draft and its photos will be removed. You can’t undo this.',
        confirmLabel: 'Delete draft',
        destructive: true,
      })
    }
  }, [overlay])
  return null
}

function GalleryBody({ overlay }: { overlay: string | null }) {
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  return (
    <Page
      width="wide"
      breadcrumbs={[{ label: 'Design system', href: '/ui-gallery' }, { label: 'Component gallery' }]}
      title="Component gallery"
      description="Every @homeowner-portal/ui component in its states. Screenshotted by the ui:shots script."
      meta={<StatusPill tone="success" label="v2" />}
      actions={
        <>
          <Button variant="secondary" icon={<Download />}>
            Export
          </Button>
          <Button icon={<Plus />}>New violation</Button>
        </>
      }
      tabs={
        <Tabs
          currentPath="/ui-gallery"
          items={[
            { label: 'Components', href: '/ui-gallery' },
            { label: 'Tokens', href: '/ui-gallery#tokens', badge: 31 },
            { label: 'Patterns', href: '/ui-gallery#patterns' },
          ]}
        />
      }
    >
      <OverlayDriver overlay={overlay} />

      <Section id="kpis" title="KPI tiles" description="Tabular figures; delta carries an arrow and sign, never colour alone; failed ≠ zero.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi label="Collected this month" value="$48,210" delta={{ value: '+8.2%', direction: 'up', sentiment: 'positive', label: 'vs Sep' }} icon={<Wallet />} />
          <Kpi label="Overdue balance" value="$6,935" delta={{ value: '+$410', direction: 'up', sentiment: 'negative', label: 'vs Sep' }} icon={<AlertTriangle />} href="#dues" linkAs={Link} />
          <Kpi label="Open violations" value="12" hint="3 need a decision" icon={<FileText />} />
          <Kpi label="Reserve fund" state="failed" icon={<Calculator />} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Kpi label="Loading" state="loading" />
          <StatCard label="Approvals waiting" icon={<Inbox />} value="5" meta="Oldest is 3 days old" cta="Review now" href="#inbox" />
          <StatCard label="Inbox" icon={<Mail />} emptyState="Inbox zero. Nothing waiting on you." />
        </div>
      </Section>

      <Section id="table" title="Data table" description="Sticky header, sort links with aria-sort, row hover, numeric columns, card layout under md.">
        <DataTable<Row>
          caption="Dues by unit"
          rows={ROWS}
          rowKey={(r) => r.id}
          mobile="cards"
          sort={{ key: 'due', direction: sortDir }}
          sortHref={(_k, d) => `#table-${d}`}
          columns={[
            { key: 'unit', header: 'Unit', cell: (r) => <span className="font-medium">{r.unit}</span>, sortable: true, mobilePrimary: true },
            { key: 'owner', header: 'Owner', cell: (r) => <span className="text-foreground-secondary">{r.owner}</span> },
            { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status} tones={STATUS_TONES} labels={STATUS_LABELS} /> },
            { key: 'updated', header: 'Updated', cell: (r) => <span className="text-muted">{r.updated}</span>, hideBelowLg: true, hideOnMobile: true },
            { key: 'due', header: 'Balance', numeric: true, sortable: true, cell: (r) => money(r.due) },
            {
              key: 'actions',
              header: <span className="sr-only">Actions</span>,
              className: 'w-12 text-right',
              hideOnMobile: true,
              cell: () => (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm" aria-label="Row actions">
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem icon={<Pencil aria-hidden />}>Edit</DropdownMenuItem>
                    <DropdownMenuItem icon={<Mail aria-hidden />}>Send reminder</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem icon={<Trash2 aria-hidden />} destructive>
                      Write off
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ),
            },
          ]}
          footer={<Pager page={2} pageSize={5} total={23} rowCount={5} hrefFor={(n) => `#page-${n}`} noun="units" />}
        />
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => setSortDir(sortDir === 'asc' ? 'desc' : 'asc')}>
            Flip sort direction
          </Button>
        </div>
        <DataTable<Row>
          caption="Compact, empty"
          density="compact"
          rows={[]}
          rowKey={(r) => r.id}
          empty={<EmptyState variant="compact" icon={<Wallet />} title="No charges this period" description="Charges appear here once dues are billed." />}
          columns={[
            { key: 'unit', header: 'Unit', cell: (r) => r.unit },
            { key: 'due', header: 'Balance', numeric: true, cell: (r) => money(r.due) },
          ]}
        />
      </Section>

      <Section id="buttons" title="Buttons" description="One primary per view. Secondary for everything else. Icons via the icon prop.">
        <Card>
          <CardContent className="space-y-4 pt-5">
            <div className="flex flex-wrap items-center gap-3">
              <Button icon={<Plus />}>Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="subtle">Subtle</Button>
              <Button variant="destructive" icon={<Trash2 />}>
                Delete
              </Button>
              <Button variant="destructive-ghost">Remove</Button>
              <Button variant="link">Link button</Button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="xs">Extra small</Button>
              <Button size="sm">Small</Button>
              <Button size="md">Medium</Button>
              <Button size="lg" iconRight={<ArrowRight />}>
                Large CTA
              </Button>
              <Tooltip content="Settings">
                <Button size="icon" variant="secondary" aria-label="Settings">
                  <Settings />
                </Button>
              </Tooltip>
              <Button size="icon-sm" variant="ghost" aria-label="Search">
                <Search />
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button loading>Saving…</Button>
              <Button variant="secondary" loading>
                Loading
              </Button>
              <Button disabled>Disabled</Button>
              <Button variant="secondary" disabled>
                Disabled
              </Button>
            </div>
          </CardContent>
        </Card>
      </Section>

      <Section id="forms" title="Forms" description="Field wires label, hint and error to the control (htmlFor, aria-describedby, aria-invalid).">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle as="h3">Record a payment</CardTitle>
              <CardDescription>Applies to the oldest open charge first.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field label="Payer email" hint="Receipts go here." required>
                <Input type="email" placeholder="name@example.com" defaultValue="owner@example.test" />
              </Field>
              <Field label="Amount" error="Enter an amount greater than $0.00.">
                <Input inputMode="decimal" prefix="$" defaultValue="0.00" />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Method">
                  <Select defaultValue="check">
                    <option value="check">Check</option>
                    <option value="ach">ACH transfer</option>
                    <option value="card">Card</option>
                  </Select>
                </Field>
                <Field label="Reference" optional>
                  <Input placeholder="Check #" />
                </Field>
              </div>
              <Field label="Memo" hint="Visible to the owner on their statement.">
                <Textarea maxLength={280} defaultValue="October assessment" />
              </Field>
              <Field label="Search units">
                <Input prefix={<Search />} placeholder="Address or owner" />
              </Field>
              <Field label="Disabled">
                <Input disabled defaultValue="Locked by the closed period" />
              </Field>
            </CardContent>
            <CardFooter className="justify-end">
              <Button variant="secondary">Cancel</Button>
              <Button>Record payment</Button>
            </CardFooter>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle as="h3">Notification settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <Fieldset legend="Send late notices by" hint="Pick every channel you want used.">
                <ChoiceGroup>
                  <Checkbox label="Email" description="Always on for owners with an address." defaultChecked />
                  <Checkbox label="SMS" description="Up to 279 characters. Longer texts are shortened and end with a portal link." />
                  <Checkbox label="Printed letter" disabled />
                </ChoiceGroup>
              </Fieldset>
              <Fieldset legend="Late fee" error="Choose how the late fee is calculated.">
                <ChoiceGroup orientation="horizontal">
                  <Radio name="fee" label="Flat $25" value="flat" />
                  <Radio name="fee" label="1.5% per month" value="pct" defaultChecked />
                  <Radio name="fee" label="None" value="none" />
                </ChoiceGroup>
              </Fieldset>
              <div className="space-y-4">
                <Switch label="Auto-send reminders" description="Three days before each due date." defaultChecked />
                <Switch label="Weekly digest to the board" />
                <Switch label="Disabled switch" disabled defaultChecked size="sm" />
              </div>
            </CardContent>
          </Card>
        </div>
      </Section>

      <Section id="status" title="Badges & status" description="StatusPill always pairs an icon with text.">
        <Card>
          <CardContent className="space-y-4 pt-5">
            <div className="flex flex-wrap gap-2">
              <StatusPill tone="success" label="Paid" />
              <StatusPill tone="warning" label="Due soon" />
              <StatusPill tone="danger" label="Overdue" />
              <StatusPill tone="info" label="Payment plan" />
              <StatusPill tone="neutral" label="Draft" />
              <StatusPill tone="ai" label="AI draft" />
              <StatusPill tone="brand" label="New" size="md" />
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge>Default</Badge>
              <Badge variant="solid">Solid</Badge>
              <Badge variant="success">Success</Badge>
              <Badge variant="warning">Warning</Badge>
              <Badge variant="destructive">Destructive</Badge>
              <Badge variant="info">Info</Badge>
              <Badge variant="neutral">Neutral</Badge>
              <Badge variant="ai">AI</Badge>
              <Badge variant="outline">Outline</Badge>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Avatar name="Avery Example" size="xs" />
              <Avatar name="Sam Placeholder" />
              <Avatar name="Riley Testcase" size="md" />
              <Avatar name="Jordan Fixture" size="lg" />
              <Avatar name="Demo Court HOA" size="lg" shape="square" />
            </div>
          </CardContent>
        </Card>
      </Section>

      <Section id="feedback" title="Feedback" description="Alert is persistent and inline; LoadFailed is a failed load, never an empty list.">
        <div className="grid gap-4 lg:grid-cols-2">
          <Alert variant="info" title="Dues are billed on the 1st">
            Owners get an email and an in-app notice the same morning.
          </Alert>
          <Alert variant="success" title="Bank feed connected">
            Transactions from the last 90 days are importing now.
          </Alert>
          <Alert variant="warning" title="Insurance certificate expires in 9 days" actions={<Button size="sm" variant="secondary">Request renewal</Button>}>
            The vendor stays approved until then.
          </Alert>
          <LoadFailed what="violations" retryHref="/ui-gallery" />
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <EmptyState icon={<FileText />} title="No documents yet" description="Upload the CC&Rs and bylaws so the board and residents can search them." action={<Button icon={<Plus />}>Upload document</Button>} secondaryAction={<Button variant="link">What should I upload?</Button>} />
          <Card>
            <CardHeader>
              <CardTitle as="h3">Loading card</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <Skeleton className="size-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-1/2" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
              <SkeletonText lines={3} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle as="h3">Board record</CardTitle>
            </CardHeader>
            <CardContent>
              <KeyValueList>
                <KeyValue label="Opened" value="Oct 2, 2026" />
                <KeyValue label="Owner" value="Avery Example" />
                <KeyValue label="Fine" value={<span className="num">$150.00</span>} />
                <KeyValue label="Hearing" value={null} />
              </KeyValueList>
            </CardContent>
          </Card>
        </div>
      </Section>

      <Section id="tabs" title="Tabs" description="Tabs = sub-pages (links). TabGroup = panels on one page.">
        <Card>
          <CardContent className="space-y-6 pt-5">
            <TabGroup defaultValue="overview">
              <TabList>
                <Tab value="overview">Overview</Tab>
                <Tab value="history">History</Tab>
                <Tab value="documents">Documents</Tab>
              </TabList>
              <TabPanel value="overview" className="text-sm text-muted">
                Overview panel content.
              </TabPanel>
              <TabPanel value="history" className="text-sm text-muted">
                History panel content.
              </TabPanel>
              <TabPanel value="documents" className="text-sm text-muted">
                Documents panel content.
              </TabPanel>
            </TabGroup>
            <TabGroup defaultValue="list" variant="segmented">
              <TabList aria-label="View">
                <Tab value="list">List</Tab>
                <Tab value="board">Board</Tab>
                <Tab value="calendar">Calendar</Tab>
              </TabList>
            </TabGroup>
            <WizardStepper
              vertical={false}
              steps={[
                { id: 'a', label: 'Details', status: 'done' },
                { id: 'b', label: 'Evidence', status: 'current' },
                { id: 'c', label: 'Review', status: 'upcoming' },
              ]}
            />
          </CardContent>
        </Card>
      </Section>

      <Section id="overlays" title="Overlays" description="Dialog, Sheet, ConfirmDialog, DropdownMenu, Tooltip — Radix focus management.">
        <Card>
          <CardContent className="flex flex-wrap gap-3 pt-5">
            <Dialog defaultOpen={overlay === 'dialog'}>
              <DialogTrigger asChild>
                <Button variant="secondary">Open dialog</Button>
              </DialogTrigger>
              <DialogContent
                title="Schedule a board meeting"
                description="Owners get the notice 14 days ahead, as the bylaws require."
                footer={
                  <>
                    <Button variant="secondary">Cancel</Button>
                    <Button>Schedule</Button>
                  </>
                }
              >
                <div className="space-y-4">
                  <Field label="Title">
                    <Input defaultValue="October board meeting" />
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Date">
                      <Input type="date" defaultValue="2026-10-28" />
                    </Field>
                    <Field label="Time">
                      <Input type="time" defaultValue="19:00" />
                    </Field>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            <Sheet defaultOpen={overlay === 'sheet'}>
              <SheetTrigger asChild>
                <Button variant="secondary">Open sheet</Button>
              </SheetTrigger>
              <SheetContent
                title="101 Demo Court"
                description="Owner since 2019 · 2 residents"
                footer={
                  <>
                    <Button variant="secondary">Close</Button>
                    <Button>Open property</Button>
                  </>
                }
              >
                <KeyValueList className="sm:grid-cols-1">
                  <KeyValue label="Balance" value={<span className="num">$1,240.50</span>} />
                  <KeyValue label="Status" value={<StatusPill tone="danger" label="Overdue" />} />
                  <KeyValue label="Last payment" value="Aug 30, 2026" />
                </KeyValueList>
              </SheetContent>
            </Sheet>
            <ConfirmDialog
              trigger={<Button variant="destructive">Revoke access</Button>}
              title="Revoke platform-admin access?"
              description="They lose access to every platform tool immediately."
              confirmLabel="Revoke"
              destructive
              onConfirm={() => new Promise((r) => setTimeout(r, 800))}
            />
            <DropdownMenu defaultOpen={overlay === 'menu'}>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" iconRight={<MoreHorizontal />}>
                  More actions
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuLabel>Violation</DropdownMenuLabel>
                <DropdownMenuItem icon={<Pencil aria-hidden />} shortcut="E">
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem icon={<Users aria-hidden />}>Assign to board member</DropdownMenuItem>
                <DropdownMenuItem icon={<Download aria-hidden />}>Download PDF</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem icon={<Trash2 aria-hidden />} destructive>
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </CardContent>
        </Card>
      </Section>

      <Section id="tokens" title="Colour tokens" description="Light values shown; dark mode swaps every role. All text pairs pass WCAG 2.2 AA (tokens.test.ts).">
        <Swatches />
      </Section>

      <Section id="type" title="Typography" description="Inter, 16px root. 15px UI text, 13px meta, 24px page titles, tabular money.">
        <Card>
          <CardContent className="space-y-3 pt-5">
            <p className="text-3xl font-semibold tracking-tight">$1,284,590.00</p>
            <p className="text-2xl font-semibold">Page title — 24/32 semibold</p>
            <p className="text-lg font-semibold">Section title — 18/26 semibold</p>
            <p className="text-base">Body — 16/24 for reading text and descriptions in long-form content.</p>
            <p className="text-sm text-foreground-secondary">UI text — 15/22, the default for tables, controls and card copy.</p>
            <p className="text-xs text-muted">Meta — 13/18 for timestamps, captions and helper text.</p>
          </CardContent>
        </Card>
      </Section>
    </Page>
  )
}

export function Gallery({ overlay, section }: { overlay: string | null; section: string | null }) {
  useEffect(() => {
    if (section) document.getElementById(section)?.scrollIntoView()
  }, [section])

  return (
    <ConfirmProvider>
      <ToastProvider>
        <AppShell linkAs={Link}>
          <AppShellSidebar collapsible>
            <SidebarBrand
              logo={<BrandMark className="size-8 rounded-lg shadow-xs" />}
            >
              <div className="min-w-0 leading-tight">
                <p className="truncate text-sm font-semibold">HomeownerHub</p>
                <p className="truncate text-xs font-normal text-muted">Demo Court HOA</p>
              </div>
            </SidebarBrand>
            <SidebarNav>
              {NAV.map((g, i) => (
                <SidebarSection key={i} {...(g.label ? { label: g.label } : {})}>
                  {g.items.map((it) => {
                    const Icon = it.icon
                    return (
                      <NavItem
                        key={it.href}
                        href={it.href}
                        icon={<Icon aria-hidden />}
                        label={it.label}
                        active={it.href === '/ui-gallery'}
                        badge={'badge' in it ? it.badge : undefined}
                      />
                    )
                  })}
                </SidebarSection>
              ))}
            </SidebarNav>
            <SidebarFooter className="hidden justify-end md:flex">
              <SidebarCollapseToggle />
            </SidebarFooter>
          </AppShellSidebar>
          <AppShellMain>
            <AppShellHeader>
              <AppShellSearchTrigger />
              <div className="ml-auto flex items-center gap-1.5">
                <Tooltip content="Notifications">
                  <Button variant="ghost" size="icon" aria-label="Notifications">
                    <Inbox />
                  </Button>
                </Tooltip>
                <UserMenu email="board@example.test" subtitle="Admin · Demo Court HOA" onSignOut={() => {}} />
              </div>
            </AppShellHeader>
            <AppShellContent>
              <GalleryBody overlay={overlay} />
            </AppShellContent>
          </AppShellMain>
          <CommandPalette commands={COMMANDS} onNavigate={(href) => (window.location.hash = href)} />
        </AppShell>
      </ToastProvider>
    </ConfirmProvider>
  )
}
