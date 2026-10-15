'use client'

import { useState } from 'react'
import { KeyRound, Mail } from 'lucide-react'
import { Tab, TabGroup, TabList, TabPanel } from '@homeowner-portal/ui'
import { MagicLinkForm } from './MagicLinkForm'
import { PasswordForm } from './PasswordForm'

// Toggles between the two sign-in methods. Password is the default; the
// magic-link form is kept for users who prefer it (and for the existing
// magic-link-only accounts). The email typed into one method carries over
// to the other, so switching never costs the user their input.
export function LoginMethods({ redirectTo }: { redirectTo?: string }) {
  const [email, setEmail] = useState('')

  return (
    <TabGroup variant="segmented" defaultValue="password" className="gap-5">
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
  )
}
