// Tokens (single source of truth — docs/specs/2026-10-15-design-system-v2.md)
export {
  tokens,
  palette,
  BRANDS,
  COLOR_ROLES,
  CONTRAST_PAIRS,
  contrastRatio,
  cssVariables,
  motion,
  radius,
  shadows,
  fontSize,
  layout,
} from './tokens'
export type { HubKey, ThemeMode, ColorRole, Palette } from './tokens'

// Theme + shell preferences
export { useTheme, useSidebarCollapsed } from './lib/theme'
export { THEME_INIT_SCRIPT } from './lib/theme-script'
export type { ThemePreference } from './lib/theme'

// Utilities
export { cn } from './lib/cn'

// Primitives
export { Button, buttonVariants } from './components/Button'
export type { ButtonProps } from './components/Button'

export { Badge, badgeVariants, StatusPill, STATUS_ICONS } from './components/Badge'
export type { BadgeProps, StatusPillProps, StatusTone } from './components/Badge'

export { StatusBadge, humanizeStatus } from './components/StatusBadge'
export type { StatusBadgeProps } from './components/StatusBadge'

export { Input } from './components/Input'
export type { InputProps } from './components/Input'

export { Textarea } from './components/Textarea'
export type { TextareaProps } from './components/Textarea'

export { Skeleton, SkeletonText } from './components/Skeleton'
export { Separator } from './components/Separator'

export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from './components/Card'
export type { CardProps, CardHeaderProps, CardTitleProps } from './components/Card'

export { StatCard, Kpi } from './components/StatCard'
export type { StatCardProps, KpiProps, KpiDelta } from './components/StatCard'

// Feedback
export { Alert } from './components/Alert'
export type { AlertProps } from './components/Alert'

export { EmptyState } from './components/EmptyState'
export type { EmptyStateProps } from './components/EmptyState'

// AI-specific (mandatory gate before any AI artifact ships)
export { BarBGate } from './components/BarBGate'
export type { BarBGateProps } from './components/BarBGate'

// Layout
export {
  AppShell,
  AppShellSidebar,
  AppShellMain,
  AppShellHeader,
  AppShellContent,
  AppShellSearchTrigger,
  SidebarCollapseToggle,
  useAppShell,
} from './layouts/AppShell'

// Sidebar primitives
export {
  SidebarBrand,
  SidebarNav,
  SidebarSection,
  SidebarFooter,
  NavItem,
} from './components/Sidebar'
export type { NavItemProps } from './components/Sidebar'

// Hub switcher (cross-hub nav in AppShellHeader)
export { HubSwitcher } from './components/HubSwitcher'
export type { Hub, HubType } from './components/HubSwitcher'

// Wizard progress indicator (used by every multi-step flow)
export { WizardStepper } from './components/WizardStepper'
export type { WizardStep } from './components/WizardStepper'

// In-page sub-nav (used as page-header tab strip on vendors / violations /
// documents / legal / accounting).
export { Tabs } from './components/Tabs'
export type { TabsProps, TabItem } from './components/Tabs'

export { Select } from './components/Select'
export type { SelectProps } from './components/Select'
export { PageHeader, Breadcrumbs } from './components/PageHeader'
export type { PageHeaderProps, BreadcrumbsProps, Crumb } from './components/PageHeader'
export { BackLink } from './components/BackLink'
export type { BackLinkProps } from './components/BackLink'
export { KeyValue, KeyValueList } from './components/KeyValue'
export type { KeyValueProps, KeyValueListProps } from './components/KeyValue'

// Modal confirm for destructive actions — replaces window.confirm.
export { ConfirmProvider, useConfirm, ConfirmDialog } from './components/Confirm'
export type { ConfirmOptions, ConfirmDialogProps } from './components/Confirm'

// Transient toast notifications for mutation feedback.
export { ToastProvider, useToast } from './components/Toast'
export type { ToastOptions } from './components/Toast'

// Page container: fixed widths and the page's one <h1>.
export { Page } from './components/Page'
export type { PageProps, PageWidth } from './components/Page'

// Truthful page states: failed (≠ empty), loading, and no org.
export { LoadFailed } from './components/LoadFailed'
export type { LoadFailedProps } from './components/LoadFailed'
export { PageSkeleton } from './components/PageSkeleton'
export type { PageSkeletonProps } from './components/PageSkeleton'
export { NoOrgSelected } from './components/NoOrgSelected'
export type { NoOrgSelectedProps } from './components/NoOrgSelected'

// URL-driven pagination, replacing silent `.limit(N)` truncation.
export { Pager, parsePageParam, pageRange, pagerState } from './components/Pager'
export type { PagerProps, PagerState } from './components/Pager'

// Table with a horizontal scroll container.
export { DataTable, TableScroll } from './components/DataTable'
export type { DataTableProps, DataTableColumn, SortDirection } from './components/DataTable'

// Forms: Field wiring (label / hint / error → id, aria-describedby, aria-invalid).
export { Field, Fieldset, Label, useField, useFieldControlProps } from './components/Field'
export type { FieldProps, FieldControlProps, LabelProps } from './components/Field'
export { Checkbox, Radio, Switch, ChoiceGroup } from './components/Choice'
export type { CheckboxProps, RadioProps, SwitchProps } from './components/Choice'

// Overlays (Radix: focus trap, Esc, focus return).
export {
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogFooter,
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
} from './components/Dialog'
export type { DialogContentProps, SheetContentProps } from './components/Dialog'
export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuGroup,
  DropdownMenuSub,
} from './components/DropdownMenu'
export type { DropdownMenuItemProps } from './components/DropdownMenu'
export { Tooltip, TooltipProvider } from './components/Tooltip'
export type { TooltipProps } from './components/Tooltip'

// In-page tabs (panels, no navigation). For URL sub-pages use `Tabs`.
export { TabGroup, TabList, Tab, TabPanel } from './components/TabGroup'
export type { TabGroupProps } from './components/TabGroup'

// People
export { Avatar, initialsOf } from './components/Avatar'
export type { AvatarProps } from './components/Avatar'

// Shell chrome
export { UserMenu } from './components/UserMenu'
export type { UserMenuProps } from './components/UserMenu'
export { CommandPalette } from './components/CommandPalette'
export type { PaletteCommand, CommandPaletteProps } from './components/CommandPalette'

// URL-driven list filters: segmented status chips + GET search box.
export { ListToolbar, FilterChips, SearchForm } from './components/ListToolbar'
export type { FilterChipItem, FilterChipsProps, SearchFormProps } from './components/ListToolbar'

// Record history for detail pages (notices, replies, decisions).
export { Timeline } from './components/Timeline'
export type { TimelineItem, TimelineProps } from './components/Timeline'
export { StatementTable, type StatementTableProps, type StatementColumn, type StatementRow, type StatementSection } from './components/StatementTable'
export { FilterBar, filterFieldClass, type FilterBarProps } from './components/FilterBar'
