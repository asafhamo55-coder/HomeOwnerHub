// Pages render their own <Page> (width, title, and the AccountingTabs
// section nav under the title), so the layout adds nothing. It used to wrap
// everything in max-w-5xl with the tabs ABOVE each page's h1, which capped
// wide reports and put the section nav before the page it belonged to.
export default function AccountingLayout({ children }: { children: React.ReactNode }) {
  return children
}
