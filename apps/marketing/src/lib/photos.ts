// Centralized photo catalog. All images sourced from Unsplash under their
// permissive license; photographer credit attached to each entry. URLs are
// the canonical `images.unsplash.com/photo-{id}` form — the HomeImage
// component appends sizing + quality params at render.

export interface Photo {
  src: string
  alt: string
  credit: string
}

export const PHOTOS = {
  // Suburban aerials — for hero / about openers
  suburbanAerial: {
    src: 'https://images.unsplash.com/photo-1516156008625-3a9d6067fab5',
    alt: 'Aerial view of a suburban neighborhood with neat rows of single-family homes and mature trees.',
    credit: 'Breno Assis · Unsplash',
  },
  hillsideAerial: {
    src: 'https://images.unsplash.com/photo-1758304480344-f8d0de5f4f25',
    alt: 'Suburban homes nestled among mature trees with a hillside backdrop.',
    credit: 'Alex Reynolds · Unsplash',
  },
  neighborhoodDusk: {
    src: 'https://images.unsplash.com/photo-1774836435838-2a6e7ef30206',
    alt: 'Residential community with well-maintained homes at dusk.',
    credit: 'Srini Somanchi · Unsplash',
  },
  treeCanopyStreet: {
    src: 'https://images.unsplash.com/photo-1748444146081-d141d1034fcb',
    alt: 'Tree-canopied residential street showing a classic suburban character.',
    credit: 'Kenneth Running · Unsplash',
  },
  plannedCommunity: {
    src: 'https://images.unsplash.com/photo-1770790323277-c1ca469472db',
    alt: 'Planned neighborhood with uniformly spaced single-family homes.',
    credit: 'Ty Dennis · Unsplash',
  },

  // Single-family homes — for PM Hub and the homepage
  grayWoodenHouse: {
    src: 'https://images.unsplash.com/photo-1570129477492-45c003edd2be',
    alt: 'Gray wooden single-family home with classic American styling.',
    credit: 'todd kent · Unsplash',
  },
  brickHomeManicured: {
    src: 'https://images.unsplash.com/photo-1773427657182-4776c4f5b363',
    alt: 'Well-maintained brick home with manicured front lawn.',
    credit: 'Roger Starnes Sr · Unsplash',
  },
  brickStoneHome: {
    src: 'https://images.unsplash.com/photo-1773427646596-01b53d5b6196',
    alt: 'Substantial brick home with stone facade detail.',
    credit: 'Roger Starnes Sr · Unsplash',
  },

  // Lifestyle / porch
  rockingChairsPorch: {
    src: 'https://images.unsplash.com/photo-1548346624-cebe41d2433c',
    alt: 'Two empty rocking chairs on a quiet front porch.',
    credit: 'Jon Tyson · Unsplash',
  },
  whiteHouseBlackDoor: {
    src: 'https://images.unsplash.com/photo-1631458325834-8f678e48912c',
    alt: 'Clean white home entryway with a black front door.',
    credit: 'Amanda Smith · Unsplash',
  },
} as const satisfies Record<string, Photo>

export type PhotoKey = keyof typeof PHOTOS
