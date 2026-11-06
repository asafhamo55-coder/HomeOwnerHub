// Not a 'use client' module: the root layout inlines TEXT_SIZE_INIT_SCRIPT
// into <head> from a server component.
//
// In-app "Text size" setting. The choice is a root font-size percentage on
// <html>; the whole UI is sized in rem, so everything scales together.
// Stored in localStorage under `larger-text`. Every storage access is wrapped
// because blocked storage (private modes, strict settings) throws.

export type TextSize = 'normal' | 'large' | 'largest'

export const TEXT_SIZE_KEY = 'larger-text'

export const TEXT_SIZES: { value: TextSize; label: string; percent: number }[] = [
  { value: 'normal', label: 'Normal', percent: 100 },
  { value: 'large', label: 'Large', percent: 115 },
  { value: 'largest', label: 'Largest', percent: 130 },
]

export function isTextSize(v: unknown): v is TextSize {
  return v === 'normal' || v === 'large' || v === 'largest'
}

export function readTextSize(): TextSize {
  try {
    const v = window.localStorage.getItem(TEXT_SIZE_KEY)
    return isTextSize(v) ? v : 'normal'
  } catch {
    return 'normal'
  }
}

/** Put the size on <html>. Works even when storage is blocked. */
export function applyTextSize(size: TextSize): void {
  if (typeof document === 'undefined') return
  const pct = TEXT_SIZES.find((s) => s.value === size)?.percent ?? 100
  const root = document.documentElement
  root.style.fontSize = pct === 100 ? '' : `${pct}%`
  root.setAttribute('data-text-size', size)
}

/** Apply and remember. Returns false when the choice could not be saved. */
export function saveTextSize(size: TextSize): boolean {
  applyTextSize(size)
  try {
    window.localStorage.setItem(TEXT_SIZE_KEY, size)
    return true
  } catch {
    return false
  }
}

export function textSizeLabel(size: TextSize): string {
  return TEXT_SIZES.find((s) => s.value === size)?.label ?? 'Normal'
}

// Runs before first paint (inline in <head>), so a saved size never flashes
// at 100% first. Keep in step with applyTextSize above.
export const TEXT_SIZE_INIT_SCRIPT =
  "(function(){try{var s=localStorage.getItem('larger-text');var p=s==='large'?115:s==='largest'?130:100;var d=document.documentElement;d.setAttribute('data-text-size',p===115?'large':p===130?'largest':'normal');if(p!==100){d.style.fontSize=p+'%';}}catch(e){}})();"
