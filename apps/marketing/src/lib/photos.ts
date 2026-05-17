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

  // Single-family homes — for PM Hub / Madison Park case study
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

// Portrait photos for the testimonials marquee. Illustrative — these are
// real Unsplash photos used as stand-ins while we onboard named-reference
// customers. Each maps to the first-name persona in TestimonialsMarquee.
export const PORTRAITS = {
  linda: {
    src: 'https://images.unsplash.com/photo-1617746167432-b3709f7e94d8',
    alt: 'Warm portrait of a woman in her late 50s, the persona Linda represents.',
    credit: 'Unsplash',
  },
  jon: {
    src: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde',
    alt: 'Professional portrait of a man, the persona Jon represents.',
    credit: 'Alex Suprun · Unsplash',
  },
  adam: {
    src: 'https://images.unsplash.com/photo-1600603406200-5b2a104684ac',
    alt: 'Portrait of a man in a white crew neck, the persona Adam represents.',
    credit: 'Vicky Hladynets · Unsplash',
  },
  maria: {
    src: 'https://images.unsplash.com/photo-1615538786254-ad8b50de17dc',
    alt: 'Portrait of a woman, the persona Maria represents.',
    credit: 'Maria Lupan · Unsplash',
  },
  marcus: {
    src: 'https://images.unsplash.com/photo-1583264277168-58ceba4b84e7',
    alt: 'Portrait of a man, the persona Marcus represents.',
    credit: 'Nathan Dumlao · Unsplash',
  },
  patricia: {
    src: 'https://images.unsplash.com/photo-1562337404-3044c84ac061',
    alt: 'Portrait of a woman, the persona Patricia represents.',
    credit: 'Kate Kozyrka · Unsplash',
  },
  james: {
    src: 'https://images.unsplash.com/photo-1648817976768-a2fdcba20f9a',
    alt: 'Portrait of a bearded man, the persona James represents.',
    credit: 'ARTISTIC FRAMES · Unsplash',
  },
  sarah: {
    src: 'https://images.unsplash.com/photo-1564564244660-5d73c057f2d2',
    alt: 'Portrait of a woman, the persona Sarah represents.',
    credit: 'Irene Strong · Unsplash',
  },
} as const satisfies Record<string, Photo>
