// What a resident usually needs to have ready for each kind of ARC request.
// Pure module (imported by a 'use client' form): type-only imports, no I/O.
// General guidance only. The association's own guidelines decide what it
// actually requires, so nothing here cites a rule.

import type { ArcCategory } from '@/lib/resident-submissions'

/** Exhaustive over ArcCategory: adding a category without an entry fails typecheck. */
export const WHAT_TO_INCLUDE: Record<ArcCategory, readonly string[]> = {
  paint: [
    'The color name and brand, or a photo of the paint chip',
    'Which surfaces you are painting or staining (walls, trim, door, garage door)',
    'A photo of the house as it looks now',
  ],
  fence: [
    'A survey or plot plan with the fence line marked',
    'Height and material',
    'A photo or brochure picture of the style',
  ],
  deck_patio: [
    'A sketch or plan with the size and location',
    'Materials and colors',
    'A survey or plot plan showing where it sits on the lot',
  ],
  roof: [
    'Material, color and brand of the new roofing',
    'A sample or photo of what it looks like',
    'Your contractor’s name and license number',
  ],
  landscaping: [
    'A simple sketch of the yard showing what goes where',
    'A list of the plants, trees or materials',
    'Anything being removed or moved',
  ],
  addition: [
    'Plans or drawings of the work',
    'A survey showing where it sits on the lot',
    'Your contractor’s license and proof of insurance',
    'Materials and colors that match the house',
  ],
  pool: [
    'A survey or plot plan showing the pool, equipment and any fencing',
    'Size, depth and type',
    'Your contractor’s license and proof of insurance',
  ],
  solar: [
    'A roof layout showing where the panels go',
    'The panel specs or a product sheet',
    'Your installer’s name and license number',
  ],
  other: [
    'A clear description of what you want to do and where',
    'Photos of the area as it is today',
  ],
}

export const ATTACH_LATER_NOTE = 'You can add photos and plans after you submit.'

/** The checklist for a category, or an empty list when none is chosen yet. */
export function whatToInclude(category: string | null | undefined): readonly string[] {
  if (!category || !Object.prototype.hasOwnProperty.call(WHAT_TO_INCLUDE, category)) return []
  return WHAT_TO_INCLUDE[category as ArcCategory]
}
