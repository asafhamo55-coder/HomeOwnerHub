'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  Input,
  StatusPill,
  Textarea,
  useToast,
} from '@homeowner-portal/ui'
import {
  addAnnouncementToSite,
  addDocumentToSite,
  removeSiteItem,
  saveSite,
  setSitePublished,
  type BoardPublicSite,
  type SiteResult,
} from '@/lib/public-site/actions'
import { publicSitePath } from '@/lib/public-site/content'

export function PublicSiteBuilder({ data }: { data: BoardPublicSite }) {
  const router = useRouter()
  const toast = useToast()
  const [pending, startTransition] = useTransition()
  const site = data.site
  const [values, setValues] = useState({
    title: site?.title ?? data.association.name,
    slug: site?.slug ?? data.suggestedSlug,
    about: site?.about ?? '',
    contactEmail: site?.contact_email ?? '',
    contactPhone: site?.contact_phone ?? '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [note, setNote] = useState<{ title: string; body: string; fromId: string | null }>({ title: '', body: '', fromId: null })

  function run(action: () => Promise<SiteResult>, done: string, onOk?: () => void) {
    startTransition(async () => {
      const res = await action()
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {})
        toast({ tone: 'error', message: res.error })
        return
      }
      setErrors({})
      toast({ tone: 'success', message: done })
      onOk?.()
      router.refresh()
    })
  }

  const set = (key: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const v = e.currentTarget.value
    setValues((prev) => ({ ...prev, [key]: v }))
  }

  const published = site?.published === true
  const link = site ? publicSitePath(site.slug) : null

  return (
    <div className="space-y-6">
      <Alert variant="info" title="Private until you turn it on">
        This page is for {data.association.name}. Once you publish it, anyone on the internet can see this page, including
        search engines. Only add things you are happy to show the whole world. Never add names, addresses, balances or
        private documents.
      </Alert>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle as="h2">1. About your community</CardTitle>
          <CardDescription>The words at the top of the page.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              run(() => saveSite(values), 'Saved.')
            }}
          >
            <Field label="Page title" error={errors.title}>
              <Input value={values.title} onChange={set('title')} maxLength={120} />
            </Field>
            <Field label="Web address" hint="Letters, numbers and dashes. Pick something short." error={errors.slug}>
              <Input value={values.slug} onChange={set('slug')} maxLength={40} />
            </Field>
            <Field label="About" hint="A few sentences for visitors. No names, phone numbers or emails here." error={errors.about}>
              <Textarea value={values.about} onChange={set('about')} rows={5} maxLength={4000} />
            </Field>
            <Field label="Contact email (optional). Shown publicly" error={errors.contactEmail}>
              <Input type="email" value={values.contactEmail} onChange={set('contactEmail')} maxLength={200} />
            </Field>
            <Field label="Contact phone (optional). Shown publicly" error={errors.contactPhone}>
              <Input value={values.contactPhone} onChange={set('contactPhone')} maxLength={40} />
            </Field>
            <Button type="submit" loading={pending}>
              Save
            </Button>
          </form>
        </CardContent>
      </Card>

      {site ? (
        <>
          <Card>
            <CardHeader className="pb-4">
              <CardTitle as="h2">2. Documents</CardTitle>
              <CardDescription>Pick the files visitors can open. Everything else stays private.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.documents.length === 0 ? (
                <p className="text-sm text-foreground-secondary">You have no documents to add yet.</p>
              ) : (
                <ul className="space-y-2">
                  {data.documents.map((d) => (
                    <li key={`${d.source}-${d.id}`} className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-border p-3">
                      <span className="min-w-0 flex-1 text-sm font-medium text-foreground">{d.title}</span>
                      {d.added ? (
                        <StatusPill tone="success" label="On the page" size="sm" />
                      ) : (
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={pending}
                          onClick={() => run(() => addDocumentToSite({ source: d.source, id: d.id, title: d.title }), 'Added to the page.')}
                        >
                          Add
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4">
              <CardTitle as="h2">3. Notices</CardTitle>
              <CardDescription>
                Start from a message you already sent, or write a new one. Read it over and take out anything private.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {data.announcements.length > 0 ? (
                <ul className="space-y-2">
                  {data.announcements.map((a) => (
                    <li key={a.id} className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-border p-3">
                      <span className="min-w-0 flex-1 text-sm font-medium text-foreground">{a.subject}</span>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setNote({ title: a.subject, body: a.text, fromId: a.id })}
                      >
                        Use this
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : null}
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault()
                  run(
                    () => addAnnouncementToSite({ title: note.title, body: note.body }),
                    'Added to the page.',
                    () => setNote({ title: '', body: '', fromId: null }),
                  )
                }}
              >
                <Field label="Notice title" error={errors.title}>
                  <Input value={note.title} onChange={(e) => setNote((n) => ({ ...n, title: e.currentTarget.value }))} maxLength={200} />
                </Field>
                <Field label="Notice text" error={errors.body}>
                  <Textarea value={note.body} onChange={(e) => setNote((n) => ({ ...n, body: e.currentTarget.value }))} rows={6} maxLength={8000} />
                </Field>
                <Button type="submit" loading={pending}>
                  Add notice to the page
                </Button>
              </form>
            </CardContent>
          </Card>

          {data.items.length > 0 ? (
            <Card>
              <CardHeader className="pb-4">
                <CardTitle as="h2">On the page now</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {data.items.map((it) => (
                    <li key={it.id} className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-border p-3">
                      <span className="min-w-0 flex-1 text-sm text-foreground">
                        <span className="font-medium">{it.title}</span>{' '}
                        <span className="text-foreground-secondary">{it.kind === 'document' ? 'Document' : 'Notice'}</span>
                      </span>
                      <Button type="button" variant="secondary" disabled={pending} onClick={() => run(() => removeSiteItem(it.id), 'Taken off the page.')}>
                        Remove
                      </Button>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader className="pb-4">
              <CardTitle as="h2">4. Turn it on</CardTitle>
              <CardDescription>
                {published ? 'Your page is on. Anyone with the link can read it.' : 'Your page is off. Nobody can see it.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {link ? (
                <p className="text-sm">
                  Link: <a className="font-medium text-primary hover:underline" href={link}>{link}</a>
                </p>
              ) : null}
              <Button
                type="button"
                variant={published ? 'secondary' : 'primary'}
                loading={pending}
                onClick={() =>
                  run(() => setSitePublished(!published), published ? 'The page is off.' : 'The page is on.')
                }
              >
                {published ? 'Turn the page off' : 'Turn the page on'}
              </Button>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  )
}
