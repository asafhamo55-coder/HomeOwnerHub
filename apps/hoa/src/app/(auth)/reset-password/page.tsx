import { KeyRound } from 'lucide-react'
import { AuthHeader } from '@/components/auth/AuthShell'
import { ResetPasswordForm } from './ResetPasswordForm'

export const metadata = { title: 'Set a new password' }

export default function ResetPasswordPage() {
  return (
    <>
      <AuthHeader
        icon={<KeyRound />}
        title="Set a new password"
        description="Choose a new password for your account. You’ll stay signed in on this device."
      />
      <ResetPasswordForm />
    </>
  )
}
