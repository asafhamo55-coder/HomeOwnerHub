import { ResetPasswordForm } from './ResetPasswordForm'

export const metadata = { title: 'Set a new password' }

export default function ResetPasswordPage() {
  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-foreground">Set a new password</h2>
        <p className="text-sm text-muted">
          Choose a new password for your account.
        </p>
      </div>
      <ResetPasswordForm />
    </div>
  )
}
