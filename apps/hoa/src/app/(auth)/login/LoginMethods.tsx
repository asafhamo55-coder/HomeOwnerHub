'use client'

import { useEffect, useState } from 'react'
import { KeyRound, Mail } from 'lucide-react'
import { Tab, TabGroup, TabList, TabPanel } from '@homeowner-portal/ui'
import { HideDuringHashSession } from '@/components/auth/HideDuringHashSession'
import { lastSignInMethod } from '@/components/auth/sign-in-memory-shared'
import type { LinkErrorCode } from './link-error'
import { LinkErrorNotice } from './LinkErrorNotice'
import { MagicLinkForm } from './MagicLinkForm'
import { PasswordForm } from './PasswordForm'

// Toggles between the two sign-in methods. Password is the default, unless a
// link just failed (then "Email me a link" opens, so the fix is one tap away)
// or this device last signed in by link. The password tab is never blocked.
// The email typed into one method carries over to the other, so switching
// never costs the user their input.
export function LoginMethods({
  redirectTo,
  linkError,
}: {
  redirectTo?: string
  linkError?: LinkErrorCode
}) {
  const [email, setEmail] = useState('')
  const [tab, setTab] = useState<'password' | 'magic-link'>(linkError ? 'magic-link' : 'password')

  useEffect(() => {
    if (linkError) {
      setTab('magic-link')
    } else if (lastSignInMethod() === 'link') {
      setTab('magic-link')
    }
  }, [linkError])

  return (
    <>
      {linkError ? (
        <HideDuringHashSession>
          <LinkErrorNotice code={linkError} email={email} redirectTo={redirectTo} />
        </HideDuringHashSession>
      ) : null}
      <TabGroup
        variant="segmented"
        value={tab}
        onValueChange={(v) => setTab(v === 'magic-link' ? 'magic-link' : 'password')}
        className="gap-5"
      >
        <TabList aria-label="Sign-in method" className="grid w-full grid-cols-2">
          <Tab value="password" className="justify-center">
            <KeyRound aria-hidden />
            Password
          </Tab>
          <Tab value="magic-link" className="justify-center">
            <Mail aria-hidden />
            Email me a link
          </Tab>
        </TabList>
        <TabPanel value="password">
          <PasswordForm redirectTo={redirectTo} email={email} onEmailChange={setEmail} />
        </TabPanel>
        <TabPanel value="magic-link">
          <MagicLinkForm redirectTo={redirectTo} email={email} onEmailChange={setEmail} />
        </TabPanel>
      </TabGroup>
    </>
  )
}
