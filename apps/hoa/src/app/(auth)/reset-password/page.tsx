import { KeyRound } from 'lucide-react'
import { AuthHeader } from '@/components/auth/AuthShell'
import { ResetPasswordForm } from './ResetPasswordForm'

export const metadata = { title: 'Choose a password' }

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>
}) {
  const { welcome } = await searchParams
  // ?welcome=1 comes from the one-time prompt after an invite or sign-in link.
  const isWelcome = welcome === '1'
  return (
    <>
      <AuthHeader
        icon={<KeyRound />}
        title={isWelcome ? 'Choose a password' : 'Set a new password'}
        description={
          isWelcome
            ? 'A password is optional. With one, you can sign in without waiting for an email. You can skip this and we will always email you a sign-in link.'
            : 'Choose a new password for your account. You’ll stay signed in on this device.'
        }
      />
      <ResetPasswordForm welcome={isWelcome} />
    </>
  )
}
