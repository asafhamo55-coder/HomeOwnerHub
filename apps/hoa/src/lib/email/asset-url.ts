/**
 * Resolves the public URL of a generated email asset.
 *
 * Deliberately NOT built on NEXT_PUBLIC_APP_URL / appUrl(). That helper
 * returns whatever host the current deployment is on, which for a preview
 * build is a vercel.app subdomain and locally is localhost:3000. Email is
 * immutable once delivered — a preview hostname baked into a sent message
 * is a permanently broken image in the recipient's archive, and it will not
 * be caught in review because it renders correctly on the machine that
 * sent it.
 *
 * So: a separate variable, and hard failure rather than a fallback.
 */

const ASSET_PATH = 'email/v1'

export function emailAssetUrl(filename: string): string {
  const base = process.env.EMAIL_ASSET_BASE_URL
  if (!base) {
    throw new Error(
      'EMAIL_ASSET_BASE_URL is not set. Email images need a stable public ' +
        'origin — do not fall back to NEXT_PUBLIC_APP_URL.',
    )
  }
  if (!base.startsWith('https://')) {
    throw new Error(`EMAIL_ASSET_BASE_URL must be https, got: ${base}`)
  }
  if (/localhost|127\.0\.0\.1/.test(base)) {
    throw new Error(`EMAIL_ASSET_BASE_URL points at localhost (${base}); sent mail would break permanently`)
  }
  if (/\.vercel\.app/.test(base)) {
    throw new Error(`EMAIL_ASSET_BASE_URL points at a Vercel preview host (${base}); use the production domain`)
  }
  return `${base.replace(/\/+$/, '')}/${ASSET_PATH}/${filename}`
}
