/**
 * The columns a board roster can carry, and how a file's headings map to
 * them (P4 / PR-02). Pure: runs in the browser (mapping step) and in tests.
 *
 * Presets:
 *   - 'cinc'     — a CINC Systems homeowner export (BL-031). The column
 *                  names below follow CINC's homeowner list as we know it;
 *                  no customer sample has been checked in yet, so unknown
 *                  CINC columns simply fall through to the generic names
 *                  and the board can fix any mapping by hand.
 *   - 'template' — our own downloadable template (templateCsv).
 *   - 'generic'  — common spreadsheet headings.
 */
import { csvDocument } from '@/lib/csv'

export const ROSTER_FIELDS = [
  { key: 'address', label: 'Property address', required: true },
  { key: 'unit', label: 'Unit / Lot #' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'zip', label: 'ZIP' },
  { key: 'owner_name', label: 'Owner name' },
  { key: 'owner_first_name', label: 'Owner first name' },
  { key: 'owner_last_name', label: 'Owner last name' },
  { key: 'owner_email', label: 'Owner email' },
  { key: 'owner_phone', label: 'Owner phone' },
  { key: 'mailing_address', label: 'Mailing address' },
  { key: 'mailing_city', label: 'Mailing city' },
  { key: 'mailing_state', label: 'Mailing state' },
  { key: 'mailing_zip', label: 'Mailing ZIP' },
  { key: 'tenure', label: 'Tenure' },
  { key: 'balance', label: 'Balance' },
] as const satisfies ReadonlyArray<{ key: string; label: string; required?: boolean }>

export type RosterFieldKey = (typeof ROSTER_FIELDS)[number]['key']

/** Field → column index in the file. A field left out is not in the file. */
export type ColumnMapping = Partial<Record<RosterFieldKey, number>>

export type RosterPreset = 'cinc' | 'template' | 'generic'

export const PRESET_LABELS: Record<RosterPreset, string> = {
  generic: 'Auto-detect',
  cinc: 'CINC Systems export',
  template: 'HOA Hub template',
}

/** "Property Address #1" → "propertyaddress1". */
export function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** Headings, best first. Exact (normalized) matches only. */
const GENERIC: Record<RosterFieldKey, readonly string[]> = {
  address: ['propertyaddress', 'address', 'streetaddress', 'address1', 'addressline1', 'siteaddress', 'serviceaddress', 'homeaddress', 'unitaddress', 'street', 'location'],
  unit: ['unit', 'unitnumber', 'unitno', 'unitlot', 'lot', 'lotnumber', 'lotno', 'apt', 'apartment', 'suite'],
  city: ['city', 'propertycity', 'sitecity', 'town'],
  state: ['state', 'propertystate', 'st', 'province'],
  zip: ['zip', 'zipcode', 'postalcode', 'postcode', 'propertyzip', 'propertyzipcode'],
  owner_name: ['ownername', 'owner', 'homeownername', 'homeowner', 'owner1', 'owner1name', 'primaryowner', 'owners', 'name', 'fullname', 'residentname', 'accountname'],
  owner_first_name: ['ownerfirstname', 'owner1firstname', 'firstname', 'first'],
  owner_last_name: ['ownerlastname', 'owner1lastname', 'lastname', 'last', 'surname'],
  owner_email: ['owneremail', 'email', 'emailaddress', 'primaryemail', 'homeowneremail', 'owner1email'],
  owner_phone: ['ownerphone', 'phone', 'phonenumber', 'primaryphone', 'cellphone', 'cell', 'mobile', 'mobilephone', 'homephone', 'telephone'],
  mailing_address: ['mailingaddress', 'mailingaddress1', 'mailingstreet', 'mailaddress', 'billingaddress'],
  mailing_city: ['mailingcity', 'mailcity', 'billingcity'],
  mailing_state: ['mailingstate', 'mailstate', 'billingstate'],
  mailing_zip: ['mailingzip', 'mailingzipcode', 'mailingpostalcode', 'mailzip', 'billingzip'],
  tenure: ['tenure', 'occupancy', 'occupancytype', 'occupancystatus', 'rental', 'isrental', 'rentalstatus', 'tenantoccupied', 'renteroccupied', 'owneroccupied'],
  balance: ['balance', 'currentbalance', 'accountbalance', 'balancedue', 'amountdue', 'totalbalance', 'totaldue'],
}

/** CINC Systems homeowner export headings, checked before the generic ones. */
const CINC: Partial<Record<RosterFieldKey, readonly string[]>> = {
  address: ['propertyaddress', 'propertyaddress1', 'propaddress'],
  unit: ['unit', 'unitnumber', 'lot'],
  city: ['propertycity', 'city'],
  state: ['propertystate', 'state'],
  zip: ['propertyzip', 'propertyzipcode', 'zip'],
  owner_name: ['homeownername', 'homeowner', 'ownername', 'owner1name'],
  owner_email: ['emailaddress', 'email', 'primaryemail', 'homeowneremail'],
  // The cell phone first: it is the one that reaches people.
  owner_phone: ['cellphone', 'mobilephone', 'homephone', 'workphone', 'phone'],
  mailing_address: ['mailingaddress1', 'mailingaddress'],
  mailing_city: ['mailingcity'],
  mailing_state: ['mailingstate'],
  mailing_zip: ['mailingzip', 'mailingzipcode'],
  tenure: ['rental', 'tenantoccupied', 'isrental', 'renter'],
  balance: ['currentbalance', 'balance', 'accountbalance', 'totaldue'],
}

/** Headings only a CINC export has. Two of them make it a CINC file. */
const CINC_SIGNALS = ['homeownername', 'homeowner', 'account', 'accountnumber', 'propertyaddress', 'mailingaddress1', 'propertycity', 'propertyzip', 'currentbalance']

/** The template's headings are the field labels, in this order. */
export const TEMPLATE_FIELDS: readonly RosterFieldKey[] = [
  'address',
  'unit',
  'city',
  'state',
  'zip',
  'owner_name',
  'owner_email',
  'owner_phone',
  'mailing_address',
  'tenure',
  'balance',
]
const LABEL = new Map<RosterFieldKey, string>(ROSTER_FIELDS.map((f) => [f.key, f.label]))
export const TEMPLATE_HEADERS: readonly string[] = TEMPLATE_FIELDS.map((k) => LABEL.get(k)!)

export function fieldLabel(key: RosterFieldKey): string {
  return LABEL.get(key)!
}

export function detectPreset(headers: readonly string[]): RosterPreset {
  const norm = headers.map(normalizeHeader)
  if (TEMPLATE_HEADERS.every((h, i) => norm[i] === normalizeHeader(h))) return 'template'
  const signals = norm.filter((h) => CINC_SIGNALS.includes(h)).length
  return signals >= 2 ? 'cinc' : 'generic'
}

/** Field → column for these headings. Each column is used at most once. */
export function autoMap(
  headers: readonly string[],
  preset: RosterPreset = detectPreset(headers),
): { mapping: ColumnMapping; preset: RosterPreset } {
  const norm = headers.map(normalizeHeader)
  const used = new Set<number>()
  const mapping: ColumnMapping = {}

  const take = (field: RosterFieldKey, test: (h: string) => boolean): boolean => {
    if (mapping[field] !== undefined) return true
    const i = norm.findIndex((h, j) => !used.has(j) && h !== '' && test(h))
    if (i < 0) return false
    mapping[field] = i
    used.add(i)
    return true
  }

  if (preset === 'template') {
    TEMPLATE_FIELDS.forEach((field) => take(field, (h) => h === normalizeHeader(LABEL.get(field)!)))
  }
  if (preset === 'cinc') {
    for (const [field, names] of Object.entries(CINC) as Array<[RosterFieldKey, readonly string[]]>) {
      for (const n of names) if (take(field, (h) => h === n)) break
    }
  }
  // Generic names, mailing fields first so "Mailing Address" is never
  // read as the property's address.
  const order: RosterFieldKey[] = [
    'mailing_address',
    'mailing_city',
    'mailing_state',
    'mailing_zip',
    ...ROSTER_FIELDS.map((f) => f.key).filter((k) => !k.startsWith('mailing_')),
  ]
  for (const field of order) {
    for (const n of GENERIC[field]) if (take(field, (h) => h === n)) break
  }
  // Last resort for the two that come in many spellings ("Owner 1 Email").
  take('owner_email', (h) => /email/.test(h))
  take('owner_phone', (h) => /phone|mobile|cell/.test(h) && !/fax/.test(h))

  // A first/last pair is only useful when there is no full-name column.
  if (mapping.owner_name !== undefined) {
    delete mapping.owner_first_name
    delete mapping.owner_last_name
  }
  return { mapping, preset }
}

/** The downloadable template: headings plus one synthetic example row. */
export function templateCsv(): string {
  const example: Record<RosterFieldKey, string> = {
    address: '12 Example Way',
    unit: 'Lot 4',
    city: 'Exampleton',
    state: 'FL',
    zip: '32000',
    owner_name: 'Jordan Example',
    owner_email: 'jordan@example.test',
    owner_phone: '555-0100',
    mailing_address: '',
    tenure: 'Owner-occupied',
    balance: '',
    owner_first_name: '',
    owner_last_name: '',
    mailing_city: '',
    mailing_state: '',
    mailing_zip: '',
  }
  return csvDocument(TEMPLATE_HEADERS, [TEMPLATE_FIELDS.map((k) => example[k])])
}
