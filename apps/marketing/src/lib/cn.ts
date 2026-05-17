type Cls = string | false | null | undefined

export function cn(...classes: Cls[]): string {
  return classes.filter(Boolean).join(' ')
}
