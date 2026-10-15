'use client'

import { useState } from 'react'
import { KeyRound, Mail } from 'lucide-react'
import { Tab, TabGroup, TabList, TabPanel } from '@homeowner-portal/ui'
import { MagicLinkForm } from '../login/MagicLinkForm'
import { SignupForm } from './SignupForm'

// Signup mirrors the login toggle: password by default, magic link as the
// no-password alternative. The magic-link form handles signup transparently
// (signInWithOtp with shouldCreateUser=true). Email carries across tabs.
export function SignupMethods() {
  const [email, setEmail] = useState('')

  return (
    <TabGroup variant="segmented" defaultValue="password" className="gap-5">
      <TabList aria-label="Sign-up method" className="grid w-full grid-cols-2">
        <Tab value="password" className="justify-center">
          <KeyRound aria-hidden />
          Use a password
        </Tab>
        <Tab value="magic-link" className="justify-center">
          <Mail aria-hidden />
          No password
        </Tab>
      </TabList>
      <TabPanel value="password">
        <SignupForm email={email} onEmailChange={setEmail} />
      </TabPanel>
      <TabPanel value="magic-link">
        <MagicLinkForm
          submitLabel="Email me a sign-up link"
          helperText="No password needed. We’ll set up your HOA on the next step."
          email={email}
          onEmailChange={setEmail}
        />
      </TabPanel>
    </TabGroup>
  )
}
