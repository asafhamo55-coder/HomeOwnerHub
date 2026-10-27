/**
 * BL-173: the occasion templates behind "New announcement".
 *
 * Every template is plain text in the composer's own editor format (blank
 * line between paragraphs, `- ` bullets), written once in English and once
 * in Spanish. The board sees the draft instantly and edits it; nothing is
 * sent from here.
 *
 * Rules the tests enforce (occasions.test.ts):
 *   - no placeholder survives a fill, with or without date/time/place;
 *   - the first paragraph ("lead") is a complete short message, so the text
 *     (SMS) the send derives from the email (composeSmsBody) keeps it whole
 *     and stays within 279 characters;
 *   - no religion-specific wording in the defaults, and no assumption about
 *     who lives in a home (no "kids", "families", "your children").
 *
 * Tokens used inside the strings below, replaced by fillLang():
 *   {assoc}      the association name
 *   {when}       " on Friday, October 31 at 6:00 PM" (or "" when unknown)
 *   {shortWhen}  ", Oct 31" (or "")
 *   {where}      " at the clubhouse" (or "")
 *   {detail}     the board's own note (or "")
 *
 * Pure and client-safe. Nothing here logs.
 */

export type AnnouncementCategory = 'announcement' | 'community' | 'emergency' | 'meeting'
export type OccasionField = 'date' | 'time' | 'place' | 'detail'

export type OccasionIcon =
  | 'ghost'
  | 'gift'
  | 'party-popper'
  | 'flag'
  | 'utensils'
  | 'graduation-cap'
  | 'car'
  | 'dog'
  | 'waves'
  | 'sun'
  | 'trash'
  | 'sprout'
  | 'tag'
  | 'lightbulb'
  | 'users'
  | 'cloud-lightning'
  | 'megaphone'

interface Lang {
  subject: string
  /** Complete short message; becomes the opening paragraph and the SMS. */
  lead: string
  /** More paragraphs, each one string (may hold "- " bullet lines). */
  more: readonly string[]
}

export interface Occasion {
  id: string
  label: string
  /** One short line under the label on the card. */
  blurb: string
  icon: OccasionIcon
  category: AnnouncementCategory
  /** Sending a text is on by default (when texting is set up). */
  urgent: boolean
  /**
   * Date-only occasions reached from the dashboard nudge (?occasion=<id>) or
   * a typed sentence, not shown as a tile on the "New announcement" grid.
   */
  hiddenFromGrid?: boolean
  /** Which optional fields the draft screen offers. */
  asks: readonly OccasionField[]
  detailLabel?: string
  /** Words that point a typed sentence at this occasion (lowercase). */
  keywords: readonly string[]
  en: Lang
  es: Lang
}

const SIGN_EN = 'Warmly,\n{assoc} Board'
const SIGN_ES = 'Cordialmente,\nLa Junta de {assoc}'

export const OCCASIONS: readonly Occasion[] = [
  {
    id: 'halloween-party',
    label: 'Halloween party',
    blurb: 'Invite everyone to the fun',
    icon: 'ghost',
    category: 'community',
    urgent: false,
    asks: ['date', 'time', 'place'],
    keywords: ['halloween', 'trick or treat', 'costume', 'spooky'],
    en: {
      subject: 'Halloween party{shortWhen}',
      lead: 'Hello neighbors! Join us for our Halloween party{when}{where}. Costumes are welcome, and everyone is invited.',
      more: [
        'Come say hello to your neighbors. If you plan to decorate or hand out treats, please keep walkways clear and porch lights on so everyone can get around safely.',
        '{detail}',
        SIGN_EN,
      ],
    },
    es: {
      subject: 'Fiesta de Halloween{shortWhen}',
      lead: '¡Hola vecinos! Los invitamos a nuestra fiesta de Halloween{when}{where}. Los disfraces son bienvenidos y todos están invitados.',
      more: [
        'Vengan a saludar a sus vecinos. Si piensan decorar o repartir dulces, por favor mantengan despejados los caminos y las luces del porche encendidas para que todos circulen con seguridad.',
        '{detail}',
        SIGN_ES,
      ],
    },
  },
  {
    id: 'happy-holidays',
    label: 'Happy holidays',
    blurb: 'A warm season greeting',
    icon: 'gift',
    category: 'community',
    urgent: false,
    asks: ['detail'],
    detailLabel: 'Anything to add? (trash schedule, office closures, etc.)',
    keywords: ['happy holidays', 'seasons greetings', 'holiday greeting', 'holiday wishes'],
    en: {
      subject: 'Happy holidays from {assoc}',
      lead: 'Hello neighbors! Happy holidays from all of us at {assoc}. Thank you for being part of this community.',
      more: [
        'Whatever you celebrate this season, we wish you rest, good company, and a bright start to the new year.',
        '{detail}',
        SIGN_EN,
      ],
    },
    es: {
      subject: 'Felices fiestas de parte de {assoc}',
      lead: '¡Hola vecinos! Felices fiestas de parte de todos en {assoc}. Gracias por ser parte de esta comunidad.',
      more: [
        'Sea lo que sea que celebren en esta temporada, les deseamos descanso, buena compañía y un excelente comienzo de año.',
        '{detail}',
        SIGN_ES,
      ],
    },
  },
  {
    id: 'new-year',
    label: 'New Year',
    blurb: 'Welcome the year ahead',
    icon: 'party-popper',
    category: 'community',
    urgent: false,
    asks: ['detail'],
    detailLabel: 'Anything to add? (a reminder, an event, etc.)',
    keywords: ['new year', "new year's", 'new years'],
    en: {
      subject: 'Happy New Year from {assoc}',
      lead: 'Hello neighbors! Happy New Year from {assoc}. Wishing you a healthy, happy year ahead.',
      more: [
        'Thank you for helping make this a good place to live. If you have ideas for the year ahead, we would love to hear them.',
        '{detail}',
        SIGN_EN,
      ],
    },
    es: {
      subject: 'Feliz Año Nuevo de parte de {assoc}',
      lead: '¡Hola vecinos! Feliz Año Nuevo de parte de {assoc}. Les deseamos un año lleno de salud y alegría.',
      more: [
        'Gracias por ayudar a que este sea un buen lugar para vivir. Si tienen ideas para el año que empieza, nos encantaría escucharlas.',
        '{detail}',
        SIGN_ES,
      ],
    },
  },
  {
    id: 'fourth-of-july',
    label: 'Fourth of July',
    blurb: 'Holiday wishes and a fireworks note',
    icon: 'flag',
    category: 'community',
    urgent: false,
    asks: ['date', 'time', 'place', 'detail'],
    detailLabel: 'Event details, if any',
    keywords: ['fourth of july', '4th of july', 'july 4', 'independence day', 'fireworks'],
    en: {
      subject: 'Fourth of July{shortWhen}',
      lead: 'Hello neighbors! Happy Fourth of July from {assoc}. Please enjoy the day safely and be kind to your neighbors and pets.',
      more: [
        'If you plan to set off fireworks, please follow local rules, keep them away from homes and landscaping, and finish by a reasonable hour. Many pets are frightened by loud noises.',
        '{detail}',
        SIGN_EN,
      ],
    },
    es: {
      subject: 'Cuatro de Julio{shortWhen}',
      lead: '¡Hola vecinos! Feliz Cuatro de Julio de parte de {assoc}. Disfruten el día con seguridad y con consideración hacia sus vecinos y mascotas.',
      more: [
        'Si piensan usar fuegos artificiales, por favor sigan las reglas locales, manténganlos lejos de las casas y la jardinería, y terminen a una hora razonable. A muchas mascotas les asustan los ruidos fuertes.',
        '{detail}',
        SIGN_ES,
      ],
    },
  },
  {
    id: 'thanksgiving',
    label: 'Thanksgiving',
    blurb: 'Thanks and a few holiday tips',
    icon: 'utensils',
    category: 'community',
    urgent: false,
    asks: ['detail'],
    detailLabel: 'Anything to add? (trash pickup change, guest parking, etc.)',
    keywords: ['thanksgiving'],
    en: {
      subject: 'Happy Thanksgiving from {assoc}',
      lead: 'Hello neighbors! Happy Thanksgiving from {assoc}. We are grateful for each of you.',
      more: [
        'If you are hosting guests, please remember that street and guest parking follow the usual community rules, and that trash pickup may run a day late after the holiday.',
        '{detail}',
        SIGN_EN,
      ],
    },
    es: {
      subject: 'Feliz Día de Acción de Gracias de parte de {assoc}',
      lead: '¡Hola vecinos! Feliz Día de Acción de Gracias de parte de {assoc}. Estamos agradecidos con cada uno de ustedes.',
      more: [
        'Si reciben invitados, recuerden que el estacionamiento en la calle y el de visitantes siguen las reglas habituales de la comunidad, y que la recolección de basura puede retrasarse un día después del feriado.',
        '{detail}',
        SIGN_ES,
      ],
    },
  },
  {
    id: 'graduation',
    label: 'Graduation congratulations',
    blurb: 'Cheer on our graduates',
    icon: 'graduation-cap',
    category: 'community',
    urgent: false,
    asks: ['detail'],
    detailLabel: 'Anything to add? (a celebration, a parking reminder, etc.)',
    keywords: ['graduation', 'graduate', 'graduates', 'commencement', 'class of'],
    en: {
      subject: 'Congratulations to our graduates',
      lead: 'Hello neighbors! Congratulations to every graduate in our community. We are proud of you.',
      more: [
        'Graduation season can bring extra visitors and cars. If you are hosting a celebration, please let guests know about guest parking and keep walkways and driveways clear.',
        '{detail}',
        SIGN_EN,
      ],
    },
    es: {
      subject: 'Felicitaciones a nuestros graduados',
      lead: '¡Hola vecinos! Felicitaciones a todos los graduados de nuestra comunidad. Estamos orgullosos de ustedes.',
      more: [
        'La temporada de graduaciones puede traer más visitas y autos. Si organizan una celebración, avisen a sus invitados sobre el estacionamiento de visitantes y mantengan despejados los caminos y las entradas.',
        '{detail}',
        SIGN_ES,
      ],
    },
  },
  {
    id: 'parking-reminder',
    label: 'Parking reminder',
    blurb: 'A friendly reminder of the rules',
    icon: 'car',
    category: 'announcement',
    urgent: false,
    asks: ['detail'],
    detailLabel: 'Anything specific? (a street, a day, a tow date)',
    keywords: ['parking', 'towing', 'tow', 'guest parking', 'visitor parking', 'vehicles'],
    en: {
      subject: 'A friendly parking reminder',
      lead: 'Hello neighbors! A friendly reminder to follow our community parking rules so everyone can get in and out safely.',
      more: [
        '- Please park in your garage, driveway, or a marked space.\n- Keep fire lanes, mailboxes, and walkways clear.\n- Guest parking is for visitors, not for long-term storage.',
        '{detail}',
        'Thank you for helping keep our streets safe and tidy.',
        SIGN_EN,
      ],
    },
    es: {
      subject: 'Un recordatorio amistoso sobre el estacionamiento',
      lead: '¡Hola vecinos! Un recordatorio amistoso para seguir las reglas de estacionamiento y que todos puedan entrar y salir con seguridad.',
      more: [
        '- Estacionen en su garaje, su entrada o un espacio marcado.\n- Mantengan despejados los carriles para bomberos, los buzones y los caminos.\n- El estacionamiento de visitantes es para visitas, no para guardar vehículos por mucho tiempo.',
        '{detail}',
        'Gracias por ayudar a mantener nuestras calles seguras y ordenadas.',
        SIGN_ES,
      ],
    },
  },
  {
    id: 'pet-rules',
    label: 'Pet waste and leash rules',
    blurb: 'Keep shared spaces clean and safe',
    icon: 'dog',
    category: 'announcement',
    urgent: false,
    asks: ['detail'],
    detailLabel: 'Anything specific? (a recent concern, a dog area)',
    keywords: ['pet', 'pets', 'dog', 'dogs', 'leash', 'pet waste', 'poop', 'animal control', 'pet control'],
    en: {
      subject: 'Pet waste and leash reminder',
      lead: 'Hello neighbors! A friendly reminder: please keep pets on a leash in shared areas and pick up after them every time.',
      more: [
        'Pet waste is unpleasant for neighbors and can harm our landscaping and water. A bag in your pocket is the easiest fix, and a few extra seconds make a big difference.',
        '{detail}',
        'Thank you for being a considerate neighbor.',
        SIGN_EN,
      ],
    },
    es: {
      subject: 'Recordatorio sobre desechos de mascotas y correas',
      lead: '¡Hola vecinos! Un recordatorio amistoso: mantengan a sus mascotas con correa en las áreas comunes y recojan sus desechos siempre.',
      more: [
        'Los desechos de mascotas son desagradables para los vecinos y pueden dañar la jardinería y el agua. Llevar una bolsa es lo más fácil, y unos segundos extra hacen una gran diferencia.',
        '{detail}',
        'Gracias por ser un buen vecino.',
        SIGN_ES,
      ],
    },
  },
  {
    id: 'pool-opening',
    label: 'Pool opening',
    blurb: 'The pool is open for the season',
    icon: 'waves',
    category: 'announcement',
    urgent: false,
    asks: ['date', 'time', 'detail'],
    detailLabel: 'Hours, key fob or pool rules to mention',
    keywords: ['pool open', 'pool opening', 'swim season', 'pool season'],
    en: {
      subject: 'The pool opens{shortWhen}',
      lead: 'Hello neighbors! Our community pool opens for the season{when}.',
      more: [
        'Please review the pool rules before your first visit, and remember that swimming is at your own risk. Be kind to your neighbors and clean up after yourself.',
        '{detail}',
        SIGN_EN,
      ],
    },
    es: {
      subject: 'Abre la piscina{shortWhen}',
      lead: '¡Hola vecinos! La piscina de nuestra comunidad abre para la temporada{when}.',
      more: [
        'Por favor revisen las reglas de la piscina antes de su primera visita y recuerden que nadar es bajo su propio riesgo. Sean amables con sus vecinos y dejen todo limpio.',
        '{detail}',
        SIGN_ES,
      ],
    },
  },
  {
    id: 'pool-closing',
    label: 'Pool closing',
    blurb: 'Last day of the season',
    icon: 'sun',
    category: 'announcement',
    urgent: false,
    asks: ['date', 'time', 'detail'],
    detailLabel: 'Anything to add? (when it reopens, furniture pickup)',
    keywords: ['pool close', 'pool closing', 'pool closed', 'closes for the season'],
    en: {
      subject: 'The pool closes{shortWhen}',
      lead: 'Hello neighbors! Our community pool closes for the season{when}. Thank you for a great summer.',
      more: ['Please remove your belongings from the pool area before it closes.', '{detail}', SIGN_EN],
    },
    es: {
      subject: 'La piscina cierra{shortWhen}',
      lead: '¡Hola vecinos! La piscina de nuestra comunidad cierra por la temporada{when}. Gracias por un gran verano.',
      more: ['Por favor retiren sus pertenencias del área de la piscina antes de que cierre.', '{detail}', SIGN_ES],
    },
  },
  {
    id: 'trash-pickup',
    label: 'Trash or bulk-pickup change',
    blurb: 'A new day or a special pickup',
    icon: 'trash',
    category: 'announcement',
    urgent: false,
    asks: ['date', 'detail'],
    detailLabel: 'What is changing? (for example: pickup moves to Thursday)',
    keywords: ['trash', 'garbage', 'bulk', 'recycling', 'pickup', 'pick-up', 'dumpster'],
    en: {
      subject: 'Trash and pickup schedule change',
      lead: 'Hello neighbors! Our trash or bulk-pickup schedule is changing{when}. {detail}',
      more: [
        'Please set bins out the evening before, and bring them in the day after pickup so walkways stay clear.',
        'If you have a question about what is accepted, reply to this message.',
        SIGN_EN,
      ],
    },
    es: {
      subject: 'Cambio en la recolección de basura',
      lead: '¡Hola vecinos! El horario de recolección de basura o de artículos voluminosos cambia{when}. {detail}',
      more: [
        'Por favor saquen los botes la noche anterior y guárdenlos el día después de la recolección para mantener despejados los caminos.',
        'Si tienen dudas sobre lo que se acepta, respondan a este mensaje.',
        SIGN_ES,
      ],
    },
  },
  {
    id: 'landscaping-water',
    label: 'Watering and landscaping',
    blurb: 'Service days and water rules',
    icon: 'sprout',
    category: 'announcement',
    urgent: false,
    asks: ['date', 'detail'],
    detailLabel: 'What should neighbors know? (watering days, crew schedule)',
    keywords: ['landscap', 'lawn', 'mow', 'watering', 'irrigation', 'sprinkler', 'trimming'],
    en: {
      subject: 'Landscaping and watering update',
      lead: 'Hello neighbors! Here is an update on landscaping and watering in our community{when}. {detail}',
      more: [
        'Crews may be working near your home. Please keep pets and vehicles clear of work areas, and let us know if you notice a broken sprinkler or an area that needs attention.',
        SIGN_EN,
      ],
    },
    es: {
      subject: 'Novedades de jardinería y riego',
      lead: '¡Hola vecinos! Esta es una novedad sobre la jardinería y el riego en nuestra comunidad{when}. {detail}',
      more: [
        'Es posible que haya personal trabajando cerca de su casa. Por favor mantengan a sus mascotas y vehículos lejos de las zonas de trabajo y avísennos si ven un aspersor dañado o un área que necesite atención.',
        SIGN_ES,
      ],
    },
  },
  {
    id: 'yard-sale',
    label: 'Community yard sale',
    blurb: 'One day, many driveways',
    icon: 'tag',
    category: 'community',
    urgent: false,
    asks: ['date', 'time', 'place', 'detail'],
    detailLabel: 'Rules or sign-up details, if any',
    keywords: ['yard sale', 'garage sale', 'rummage', 'swap'],
    en: {
      subject: 'Community yard sale{shortWhen}',
      lead: 'Hello neighbors! Our community yard sale is coming up{when}{where}. Clean out your closets and join in.',
      more: [
        'Please keep signs neat and take them down when the sale ends, and leave room on the street for cars and walkers.',
        '{detail}',
        SIGN_EN,
      ],
    },
    es: {
      subject: 'Venta de garaje comunitaria{shortWhen}',
      lead: '¡Hola vecinos! Se acerca nuestra venta de garaje comunitaria{when}{where}. Es buen momento para ordenar y participar.',
      more: [
        'Por favor mantengan los letreros en buen estado, retírenlos cuando termine la venta y dejen espacio en la calle para autos y peatones.',
        '{detail}',
        SIGN_ES,
      ],
    },
  },
  {
    id: 'holiday-lights',
    label: 'Holiday lights contest',
    blurb: 'Light up the neighborhood',
    icon: 'lightbulb',
    category: 'community',
    urgent: false,
    asks: ['date', 'detail'],
    detailLabel: 'How to enter, judging date, prizes',
    keywords: ['lights', 'lighting contest', 'decorating contest', 'decoration', 'decorations', 'light display'],
    en: {
      subject: 'Holiday lights contest',
      lead: 'Hello neighbors! Our holiday lights contest is on. Decorate your home and share the glow{when}.',
      more: [
        'Everyone is welcome to take part. Please use outdoor-rated lights and cords, and turn them off at a considerate hour.',
        '{detail}',
        SIGN_EN,
      ],
    },
    es: {
      subject: 'Concurso de luces de temporada',
      lead: '¡Hola vecinos! Comenzó nuestro concurso de luces de temporada. Decoren su casa y compartan el brillo{when}.',
      more: [
        'Todos pueden participar. Por favor usen luces y cables para exteriores, y apáguenlos a una hora considerada con los vecinos.',
        '{detail}',
        SIGN_ES,
      ],
    },
  },
  {
    id: 'annual-meeting',
    label: 'Annual meeting reminder',
    blurb: 'Date, time and place',
    icon: 'users',
    category: 'meeting',
    urgent: false,
    asks: ['date', 'time', 'place', 'detail'],
    detailLabel: 'Agenda items or how to join online',
    keywords: ['annual meeting', 'meeting', 'board meeting', 'town hall', 'election'],
    en: {
      subject: 'Annual meeting reminder{shortWhen}',
      lead: 'Hello neighbors! A reminder that our annual meeting is{when}{where}. We hope to see you there.',
      more: [
        'The annual meeting is where we review the year and hear from you. Please come with your questions. Your voice matters.',
        '{detail}',
        SIGN_EN,
      ],
    },
    es: {
      subject: 'Recordatorio de la asamblea anual{shortWhen}',
      lead: '¡Hola vecinos! Les recordamos que nuestra asamblea anual es{when}{where}. Esperamos verlos allí.',
      more: [
        'En la asamblea anual repasamos el año y escuchamos sus opiniones. Por favor lleven sus preguntas. Su voz importa.',
        '{detail}',
        SIGN_ES,
      ],
    },
  },
  {
    id: 'severe-weather',
    label: 'Severe weather',
    blurb: 'A safety notice for storms',
    icon: 'cloud-lightning',
    category: 'emergency',
    urgent: true,
    asks: ['date', 'detail'],
    detailLabel: 'What should residents do? (secure items, shelter)',
    keywords: ['storm', 'hurricane', 'tornado', 'severe weather', 'flood', 'flooding', 'freeze', 'snow', 'heat advisory'],
    en: {
      subject: 'Severe weather notice',
      lead: 'Hello neighbors! Severe weather is expected{when}. Please stay safe and check on your neighbors.',
      more: [
        '- Bring in or secure loose items such as furniture, bins, and decorations.\n- Charge your phones and keep emergency supplies handy.\n- Follow instructions from local emergency officials.',
        '{detail}',
        'Please call 911 for any emergency.',
        SIGN_EN,
      ],
    },
    es: {
      subject: 'Aviso de clima severo',
      lead: '¡Hola vecinos! Se espera clima severo{when}. Por favor cuídense y estén pendientes de sus vecinos.',
      more: [
        '- Guarden o aseguren objetos sueltos como muebles, botes y decoraciones.\n- Carguen sus teléfonos y tengan a mano suministros de emergencia.\n- Sigan las instrucciones de las autoridades locales.',
        '{detail}',
        'Llamen al 911 en caso de emergencia.',
        SIGN_ES,
      ],
    },
  },
  {
    id: 'mlk-day',
    label: 'Martin Luther King Jr. Day',
    blurb: 'A short note of remembrance',
    icon: 'flag',
    category: 'community',
    urgent: false,
    hiddenFromGrid: true,
    asks: ['detail'],
    detailLabel: 'Anything to add? (office or trash schedule)',
    keywords: ['martin luther king', 'mlk'],
    en: {
      subject: 'Martin Luther King Jr. Day',
      lead: 'Hello neighbors! On Martin Luther King Jr. Day, {assoc} remembers a leader who worked for fairness and dignity for everyone.',
      more: [
        'Some offices and services may be closed or run on a different schedule today.',
        '{detail}',
        SIGN_EN,
      ],
    },
    es: {
      subject: 'Día de Martin Luther King Jr.',
      lead: '¡Hola vecinos! En el Día de Martin Luther King Jr., {assoc} recuerda a un líder que trabajó por la justicia y la dignidad de todas las personas.',
      more: [
        'Algunas oficinas y servicios pueden estar cerrados o tener un horario distinto hoy.',
        '{detail}',
        SIGN_ES,
      ],
    },
  },
  {
    id: 'presidents-day',
    label: 'Presidents\' Day',
    blurb: 'A holiday note and schedule',
    icon: 'flag',
    category: 'community',
    urgent: false,
    hiddenFromGrid: true,
    asks: ['detail'],
    detailLabel: 'Anything to add? (office or trash schedule)',
    keywords: ['presidents day', 'president\'s day', 'presidents\' day'],
    en: {
      subject: 'Presidents\' Day',
      lead: 'Hello neighbors! Wishing everyone a relaxed Presidents\' Day weekend from all of us at {assoc}.',
      more: [
        'Some offices and services may be closed or run on a different schedule today.',
        '{detail}',
        SIGN_EN,
      ],
    },
    es: {
      subject: 'Día de los Presidentes',
      lead: '¡Hola vecinos! Les deseamos un fin de semana tranquilo por el Día de los Presidentes, de parte de todos en {assoc}.',
      more: [
        'Algunas oficinas y servicios pueden estar cerrados o tener un horario distinto hoy.',
        '{detail}',
        SIGN_ES,
      ],
    },
  },
  {
    id: 'juneteenth',
    label: 'Juneteenth',
    blurb: 'A respectful holiday note',
    icon: 'party-popper',
    category: 'community',
    urgent: false,
    hiddenFromGrid: true,
    asks: ['detail'],
    detailLabel: 'Anything to add? (office or trash schedule)',
    keywords: ['juneteenth'],
    en: {
      subject: 'Juneteenth',
      lead: 'Hello neighbors! Today is Juneteenth, which marks the end of slavery in the United States. {assoc} wishes you a thoughtful day.',
      more: [
        'Some offices and services may be closed or run on a different schedule today.',
        '{detail}',
        SIGN_EN,
      ],
    },
    es: {
      subject: 'Juneteenth',
      lead: '¡Hola vecinos! Hoy es Juneteenth, que conmemora el fin de la esclavitud en Estados Unidos. {assoc} les desea un día de reflexión.',
      more: [
        'Algunas oficinas y servicios pueden estar cerrados o tener un horario distinto hoy.',
        '{detail}',
        SIGN_ES,
      ],
    },
  },
  {
    id: 'veterans-day',
    label: 'Veterans Day',
    blurb: 'Thank those who served',
    icon: 'flag',
    category: 'community',
    urgent: false,
    hiddenFromGrid: true,
    asks: ['detail'],
    detailLabel: 'Anything to add? (office or trash schedule, a local event)',
    keywords: ['veterans day', 'veterans', 'veteran'],
    en: {
      subject: 'Veterans Day',
      lead: 'Hello neighbors! On Veterans Day, {assoc} says thank you to every neighbor who has served in the armed forces.',
      more: [
        'Some offices and services may be closed or run on a different schedule today.',
        '{detail}',
        SIGN_EN,
      ],
    },
    es: {
      subject: 'Día de los Veteranos',
      lead: '¡Hola vecinos! En el Día de los Veteranos, {assoc} agradece a cada vecino que ha servido en las fuerzas armadas.',
      more: [
        'Algunas oficinas y servicios pueden estar cerrados o tener un horario distinto hoy.',
        '{detail}',
        SIGN_ES,
      ],
    },
  },
  {
    id: 'mothers-day',
    label: 'Mother\'s Day',
    blurb: 'A warm greeting',
    icon: 'gift',
    category: 'community',
    urgent: false,
    hiddenFromGrid: true,
    asks: ['detail'],
    detailLabel: 'Anything to add?',
    keywords: ['mother\'s day', 'mothers day'],
    en: {
      subject: 'Happy Mother\'s Day',
      lead: 'Hello neighbors! Happy Mother\'s Day from {assoc} to everyone who is celebrating, remembering, or caring for someone today.',
      more: [
        'We hope your day is full of warmth and good company.',
        '{detail}',
        SIGN_EN,
      ],
    },
    es: {
      subject: 'Feliz Día de las Madres',
      lead: '¡Hola vecinos! Feliz Día de las Madres de parte de {assoc} para todos los que hoy celebran, recuerdan o cuidan a alguien.',
      more: [
        'Esperamos que tengan un día lleno de cariño y buena compañía.',
        '{detail}',
        SIGN_ES,
      ],
    },
  },
  {
    id: 'fathers-day',
    label: 'Father\'s Day',
    blurb: 'A warm greeting',
    icon: 'gift',
    category: 'community',
    urgent: false,
    hiddenFromGrid: true,
    asks: ['detail'],
    detailLabel: 'Anything to add?',
    keywords: ['father\'s day', 'fathers day'],
    en: {
      subject: 'Happy Father\'s Day',
      lead: 'Hello neighbors! Happy Father\'s Day from {assoc} to everyone who is celebrating, remembering, or caring for someone today.',
      more: [
        'We hope your day is full of warmth and good company.',
        '{detail}',
        SIGN_EN,
      ],
    },
    es: {
      subject: 'Feliz Día del Padre',
      lead: '¡Hola vecinos! Feliz Día del Padre de parte de {assoc} para todos los que hoy celebran, recuerdan o cuidan a alguien.',
      more: [
        'Esperamos que tengan un día lleno de cariño y buena compañía.',
        '{detail}',
        SIGN_ES,
      ],
    },
  },
  {
    id: 'earth-day',
    label: 'Earth Day',
    blurb: 'Cleanup, planting, recycling',
    icon: 'sprout',
    category: 'community',
    urgent: false,
    hiddenFromGrid: true,
    asks: ['date', 'time', 'place', 'detail'],
    detailLabel: 'Cleanup details, what to bring, if any',
    keywords: ['earth day', 'cleanup', 'clean-up', 'clean up'],
    en: {
      subject: 'Earth Day{shortWhen}',
      lead: 'Hello neighbors! Happy Earth Day from {assoc}. Join us in taking care of our shared spaces{when}{where}.',
      more: [
        'Small things help: recycle right, pick up litter you see, and conserve water where you can.',
        '{detail}',
        SIGN_EN,
      ],
    },
    es: {
      subject: 'Día de la Tierra{shortWhen}',
      lead: '¡Hola vecinos! Feliz Día de la Tierra de parte de {assoc}. Los invitamos a cuidar nuestros espacios compartidos{when}{where}.',
      more: [
        'Los pequeños gestos ayudan: reciclar bien, recoger la basura que vean y ahorrar agua cuando puedan.',
        '{detail}',
        SIGN_ES,
      ],
    },
  },
  {
    id: 'valentines-day',
    label: 'Valentine\'s Day',
    blurb: 'A light, friendly greeting',
    icon: 'gift',
    category: 'community',
    urgent: false,
    hiddenFromGrid: true,
    asks: ['detail'],
    detailLabel: 'Anything to add?',
    keywords: ['valentine'],
    en: {
      subject: 'Happy Valentine\'s Day',
      lead: 'Hello neighbors! Happy Valentine\'s Day from {assoc}. Here is to good neighbors and kind words.',
      more: [
        'Wishing you a warm and happy day.',
        '{detail}',
        SIGN_EN,
      ],
    },
    es: {
      subject: 'Feliz Día de San Valentín',
      lead: '¡Hola vecinos! Feliz Día de San Valentín de parte de {assoc}. Un brindis por los buenos vecinos y las palabras amables.',
      more: [
        'Les deseamos un día cálido y feliz.',
        '{detail}',
        SIGN_ES,
      ],
    },
  },
  {
    id: 'dst-ends',
    label: 'Clocks go back',
    blurb: 'Daylight saving ends: clocks and smoke alarms',
    icon: 'sun',
    category: 'community',
    urgent: false,
    hiddenFromGrid: true,
    asks: ['detail'],
    detailLabel: 'Anything to add?',
    keywords: ['daylight saving ends', 'fall back', 'clocks back', 'set clocks back'],
    en: {
      subject: 'Clocks go back this Sunday',
      lead: 'Hello neighbors! Daylight saving time ends this Sunday. Turn your clocks back one hour before bed on Saturday night.',
      more: [
        'It is also a good time to test your smoke and carbon monoxide alarms and replace their batteries if needed.',
        '{detail}',
        SIGN_EN,
      ],
    },
    es: {
      subject: 'Se atrasa el reloj este domingo',
      lead: '¡Hola vecinos! El horario de verano termina este domingo. Atrasen sus relojes una hora antes de dormir el sábado por la noche.',
      more: [
        'Es también un buen momento para probar sus alarmas de humo y de monóxido de carbono y cambiar las baterías si hace falta.',
        '{detail}',
        SIGN_ES,
      ],
    },
  },
  {
    id: 'dst-starts',
    label: 'Clocks go forward',
    blurb: 'Daylight saving starts: clocks and smoke alarms',
    icon: 'sun',
    category: 'community',
    urgent: false,
    hiddenFromGrid: true,
    asks: ['detail'],
    detailLabel: 'Anything to add?',
    keywords: ['daylight saving starts', 'spring forward', 'clocks forward', 'set clocks forward'],
    en: {
      subject: 'Clocks go forward this Sunday',
      lead: 'Hello neighbors! Daylight saving time starts this Sunday. Turn your clocks forward one hour before bed on Saturday night.',
      more: [
        'It is also a good time to test your smoke and carbon monoxide alarms and replace their batteries if needed.',
        '{detail}',
        SIGN_EN,
      ],
    },
    es: {
      subject: 'Se adelanta el reloj este domingo',
      lead: '¡Hola vecinos! El horario de verano comienza este domingo. Adelanten sus relojes una hora antes de dormir el sábado por la noche.',
      more: [
        'Es también un buen momento para probar sus alarmas de humo y de monóxido de carbono y cambiar las baterías si hace falta.',
        '{detail}',
        SIGN_ES,
      ],
    },
  },
  {
    id: 'fire-prevention',
    label: 'Fire Prevention Week',
    blurb: 'Smoke alarms and safe habits',
    icon: 'megaphone',
    category: 'emergency',
    urgent: false,
    hiddenFromGrid: true,
    asks: ['detail'],
    detailLabel: 'Anything to add? (a drill, a visit from the fire department)',
    keywords: ['fire prevention', 'smoke alarm', 'smoke detector', 'fire safety'],
    en: {
      subject: 'Fire Prevention Week',
      lead: 'Hello neighbors! It is Fire Prevention Week. Please test your smoke alarms this week and replace any that are more than 10 years old.',
      more: [
        '- Keep walkways, exits and stairwells clear.\n- Never leave cooking unattended.\n- Plan two ways out of your home and know where to meet.',
        'Call 911 in an emergency.',
        '{detail}',
        SIGN_EN,
      ],
    },
    es: {
      subject: 'Semana de Prevención de Incendios',
      lead: '¡Hola vecinos! Es la Semana de Prevención de Incendios. Por favor prueben sus alarmas de humo esta semana y cambien las que tengan más de 10 años.',
      more: [
        '- Mantengan despejados los caminos, las salidas y las escaleras.\n- Nunca dejen la cocina desatendida.\n- Planifiquen dos salidas de su hogar y un lugar de encuentro.',
        'Llamen al 911 en caso de emergencia.',
        '{detail}',
        SIGN_ES,
      ],
    },
  },
]

/** The tiles on the "New announcement" grid. */
export const GRID_OCCASIONS: readonly Occasion[] = OCCASIONS.filter((o) => !o.hiddenFromGrid)

/** A typed sentence that matches no occasion. */
export const CUSTOM_OCCASION_ID = 'custom'

export function getOccasion(id: string | null | undefined): Occasion | null {
  return OCCASIONS.find((o) => o.id === id) ?? null
}

// ── Facts and formatting ───────────────────────────────────────────────

export interface AnnouncementFacts {
  /** "YYYY-MM-DD", or ''. */
  date: string
  /** "HH:mm" (24 hour), or ''. */
  time: string
  place: string
  detail: string
}

export const EMPTY_FACTS: AnnouncementFacts = { date: '', time: '', place: '', detail: '' }

const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const MONTHS_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const DAYS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const DAYS_ES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

export function isIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const [y, m, d] = s.split('-').map(Number) as [number, number, number]
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

export function isHm(s: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s)
}

function dateParts(iso: string): { m: number; d: number; dow: number } {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  return { m: m - 1, d, dow: new Date(Date.UTC(y, m - 1, d)).getUTCDay() }
}

export function formatDateLong(iso: string, lang: 'en' | 'es'): string {
  const p = dateParts(iso)
  return lang === 'en' ? `${DAYS_EN[p.dow]}, ${MONTHS_EN[p.m]} ${p.d}` : `${DAYS_ES[p.dow]}, ${p.d} de ${MONTHS_ES[p.m]}`
}

export function formatDateShort(iso: string, lang: 'en' | 'es'): string {
  const p = dateParts(iso)
  return lang === 'en' ? `${MONTHS_EN[p.m]!.slice(0, 3)} ${p.d}` : `${p.d} de ${MONTHS_ES[p.m]!.slice(0, 3)}`
}

export function formatTime(hm: string, lang: 'en' | 'es'): string {
  const [h, m] = hm.split(':').map(Number) as [number, number]
  const mm = String(m).padStart(2, '0')
  const h12 = h % 12 === 0 ? 12 : h % 12
  if (lang === 'es') return `${h12}:${mm} ${h < 12 ? 'a. m.' : 'p. m.'}`
  return `${h12}:${mm} ${h < 12 ? 'AM' : 'PM'}`
}

/** Strips anything that could be mistaken for a merge field or markup. */
export function cleanFact(s: string, max = 200): string {
  return s
    .replace(/\{\{|\}\}|[{}<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

function whenPhrase(f: AnnouncementFacts, lang: 'en' | 'es'): string {
  const date = isIsoDate(f.date) ? formatDateLong(f.date, lang) : ''
  const time = isHm(f.time) ? formatTime(f.time, lang) : ''
  if (lang === 'en') {
    if (date && time) return ` on ${date} at ${time}`
    if (date) return ` on ${date}`
    if (time) return ` at ${time}`
    return ''
  }
  if (date && time) return ` el ${date} a las ${time}`
  if (date) return ` el ${date}`
  if (time) return ` a las ${time}`
  return ''
}

function wherePhrase(place: string, lang: 'en' | 'es'): string {
  const p = cleanFact(place, 120)
  if (!p) return ''
  return lang === 'en' ? ` at ${p}` : ` en ${p}`
}

export interface FilledAnnouncement {
  subject: string
  /** Plain text in the composer's editor format. */
  body: string
}

function tidy(s: string): string {
  return s
    .replace(/[ \t]+/g, ' ')
    .replace(/ +([.,!?])/g, '$1')
    .replace(/ *\n */g, '\n')
    .trim()
}

function fillText(src: string, tokens: Record<string, string>): string {
  return src.replace(/\{(\w+)\}/g, (_m, k: string) => tokens[k] ?? '')
}

export function fillLang(lang: Lang, assoc: string, facts: AnnouncementFacts, code: 'en' | 'es'): FilledAnnouncement {
  const tokens: Record<string, string> = {
    assoc: cleanFact(assoc, 120) || (code === 'en' ? 'your community' : 'su comunidad'),
    when: whenPhrase(facts, code),
    shortWhen: isIsoDate(facts.date) ? `, ${formatDateShort(facts.date, code)}` : '',
    where: wherePhrase(facts.place, code),
    detail: cleanFact(facts.detail, 600),
  }
  const subject = tidy(fillText(lang.subject, tokens)).replace(/\n/g, ' ').slice(0, 120)
  const paragraphs = [lang.lead, ...lang.more].map((p) => tidy(fillText(p, tokens))).filter((p) => p !== '')
  return { subject, body: paragraphs.join('\n\n') }
}

export function fillOccasion(
  occasion: Occasion,
  assoc: string,
  facts: AnnouncementFacts,
): { en: FilledAnnouncement; es: FilledAnnouncement } {
  return { en: fillLang(occasion.en, assoc, facts, 'en'), es: fillLang(occasion.es, assoc, facts, 'es') }
}

function shortSubject(text: string): string {
  const t = text.replace(/[.!?]+$/, '')
  if (t.length <= 60) return t || 'Community announcement'
  const cut = t.slice(0, 60)
  return cut.slice(0, Math.max(cut.lastIndexOf(' '), 20)).trim()
}

/**
 * The draft for a sentence that matches no occasion: the board's own
 * words, tidied, with the parsed facts. Used instantly and as the fallback
 * when the AI is unavailable. English only; the Spanish option asks the
 * existing translation helper.
 */
export function fillCustom(sentence: string, assoc: string, facts: AnnouncementFacts): FilledAnnouncement {
  const clean = cleanFact(sentence, 600)
  const first = clean.charAt(0).toUpperCase() + clean.slice(1)
  const lead = `Hello neighbors! ${first}${/[.!?]$/.test(first) ? '' : '.'}`
  const bits: string[] = []
  const date = isIsoDate(facts.date) ? formatDateLong(facts.date, 'en') : ''
  const time = isHm(facts.time) ? formatTime(facts.time, 'en') : ''
  if (date || time) bits.push(`When: ${[date, time].filter(Boolean).join(' at ')}`)
  const where = cleanFact(facts.place, 120)
  if (where) bits.push(`Where: ${where}`)
  const body = [lead, bits.join('\n'), cleanFact(facts.detail, 600), `Warmly,\n${cleanFact(assoc, 120) || 'Your community'} Board`]
    .map((p) => tidy(p))
    .filter((p) => p !== '')
    .join('\n\n')
  return { subject: shortSubject(first), body }
}

/** Which occasion a typed sentence points at, or null. Longest keyword wins. */
export function matchOccasion(sentence: string): Occasion | null {
  const s = ` ${sentence.toLowerCase().replace(/[^a-z0-9' ]+/g, ' ')} `
  let best: { o: Occasion; score: number } | null = null
  for (const o of OCCASIONS) {
    let score = 0
    for (const k of o.keywords) {
      if (s.includes(k.length <= 4 ? ` ${k} ` : k)) score = Math.max(score, k.length)
    }
    if (score > 0 && (!best || score > best.score)) best = { o, score }
  }
  return best ? best.o : null
}
