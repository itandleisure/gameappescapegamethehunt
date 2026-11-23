import { distanceMeters, type GpsFix } from './geo.js';
import type { GameEvent, GamePackage, Rule, TeamState, Text } from './types.js';
import { puzzleTasks } from './engine.js';

// ---------------------------------------------------------------------------
// Nieuwsflitsen
// ---------------------------------------------------------------------------

/**
 * Snelknop van de spelleider: een vast bericht dat met één tik als
 * nieuwsflits naar alle teams van de hunt gaat, al vertaald in elke taal.
 * In te stellen in het beheer (Instellingen › Nieuwsflitsen).
 */
export interface NewsPreset {
  id: string;
  /** Eén emoji, zoals ⏳. */
  icon: string;
  title: Text;
  body?: Text;
}

/** Welke automatische nieuwsflitsen de teams krijgen. */
export interface NewsAuto {
  /** Een ander team heeft het extractiepunt bereikt. */
  escaped: boolean;
  /** Een ander team heeft een puzzel opgelost. */
  puzzle: boolean;
  /** Nog 10 minuten tot het einde (alleen bij een spel dat eindigt na een vaste tijd). */
  timeLeft: boolean;
}

export const DEFAULT_NEWS_AUTO: NewsAuto = { escaped: true, puzzle: true, timeLeft: true };

/** Zoveel minuten voor het einde komt de automatische flits "Nog … minuten". */
export const TIME_LEFT_NOTICE_MINUTES = 10;

/** Langste titel en tekst van een nieuwsflits. */
export const NEWS_TITLE_MAX = 120;
export const NEWS_BODY_MAX = 300;

/**
 * Startset snelknoppen, in alle 25 talen. Een voorstel: in het beheer aan te
 * passen, aan te vullen of weg te halen.
 */
export const DEFAULT_NEWS_PRESETS: NewsPreset[] = [
  {
    id: 'nog-10-minuten',
    icon: '⏳',
    title: {
      nl: 'Nog 10 minuten!', en: '10 minutes left!', de: 'Noch 10 Minuten!', fr: 'Plus que 10 minutes !', es: '¡Quedan 10 minutos!',
      it: 'Mancano 10 minuti!', pt: 'Faltam 10 minutos!', da: '10 minutter tilbage!', sv: '10 minuter kvar!', no: '10 minutter igjen!',
      fi: '10 minuuttia jäljellä!', pl: 'Zostało 10 minut!', cs: 'Zbývá 10 minut!', sk: 'Zostáva 10 minút!', hu: 'Még 10 perc!',
      ro: 'Mai sunt 10 minute!', bg: 'Остават 10 минути!', el: 'Απομένουν 10 λεπτά!', hr: 'Još 10 minuta!', sl: 'Še 10 minut!',
      et: 'Veel 10 minutit!', lv: 'Atlikušas 10 minūtes!', lt: 'Liko 10 minučių!', ga: '10 nóiméad fágtha!', mt: 'Fadal 10 minuti!',
    },
    body: {
      nl: 'Haal het extractiepunt voordat de tijd op is.', en: 'Reach the extraction point before time runs out.',
      de: 'Erreicht den Extraktionspunkt, bevor die Zeit abläuft.', fr: "Atteignez le point d'extraction avant la fin du temps.",
      es: 'Llegad al punto de extracción antes de que se acabe el tiempo.', it: 'Raggiungete il punto di estrazione prima che scada il tempo.',
      pt: 'Cheguem ao ponto de extração antes que o tempo acabe.', da: 'Nå udtrækningspunktet, før tiden løber ud.',
      sv: 'Ta er till extraktionspunkten innan tiden är slut.', no: 'Kom dere til uttrekkspunktet før tiden er ute.',
      fi: 'Ehtikää poistumispisteeseen ennen kuin aika loppuu.', pl: 'Dotrzyjcie do punktu ewakuacji, zanim skończy się czas.',
      cs: 'Dostaňte se na místo evakuace, než vyprší čas.', sk: 'Dostaňte sa na miesto evakuácie, kým vyprší čas.',
      hu: 'Érjetek a kimentési ponthoz, mielőtt lejár az idő.', ro: 'Ajungeți la punctul de extracție înainte să expire timpul.',
      bg: 'Стигнете до точката за изтегляне, преди времето да изтече.', el: 'Φτάστε στο σημείο διαφυγής πριν τελειώσει ο χρόνος.',
      hr: 'Stignite do točke izvlačenja prije nego što istekne vrijeme.', sl: 'Pridite do točke izvleka, preden poteče čas.',
      et: 'Jõudke väljapääsupunkti enne, kui aeg otsa saab.', lv: 'Nokļūstiet evakuācijas punktā, pirms beidzas laiks.',
      lt: 'Pasiekite evakuacijos tašką, kol nesibaigė laikas.', ga: 'Sroichigí an pointe éalaithe sula mbeidh an t-am istigh.',
      mt: 'Laħqu l-punt tal-ħarba qabel ma jispiċċa l-ħin.',
    },
  },
  {
    id: 'nog-5-minuten',
    icon: '⏳',
    title: {
      nl: 'Nog 5 minuten!', en: '5 minutes left!', de: 'Noch 5 Minuten!', fr: 'Plus que 5 minutes !', es: '¡Quedan 5 minutos!',
      it: 'Mancano 5 minuti!', pt: 'Faltam 5 minutos!', da: '5 minutter tilbage!', sv: '5 minuter kvar!', no: '5 minutter igjen!',
      fi: '5 minuuttia jäljellä!', pl: 'Zostało 5 minut!', cs: 'Zbývá 5 minut!', sk: 'Zostáva 5 minút!', hu: 'Még 5 perc!',
      ro: 'Mai sunt 5 minute!', bg: 'Остават 5 минути!', el: 'Απομένουν 5 λεπτά!', hr: 'Još 5 minuta!', sl: 'Še 5 minut!',
      et: 'Veel 5 minutit!', lv: 'Atlikušas 5 minūtes!', lt: 'Liko 5 minutės!', ga: '5 nóiméad fágtha!', mt: 'Fadal 5 minuti!',
    },
    body: {
      nl: 'Nu of nooit: op naar het extractiepunt.', en: "Now or never: head for the extraction point.",
      de: 'Jetzt oder nie: ab zum Extraktionspunkt.', fr: "C'est maintenant ou jamais : direction le point d'extraction.",
      es: 'Ahora o nunca: ¡al punto de extracción!', it: 'Ora o mai più: andate al punto di estrazione.',
      pt: 'Agora ou nunca: rumo ao ponto de extração.', da: 'Nu eller aldrig: af sted til udtrækningspunktet.',
      sv: 'Nu eller aldrig: iväg till extraktionspunkten.', no: 'Nå eller aldri: av gårde til uttrekkspunktet.',
      fi: 'Nyt tai ei koskaan: poistumispisteeseen!', pl: 'Teraz albo nigdy: ruszajcie do punktu ewakuacji.',
      cs: 'Teď, nebo nikdy: hurá na místo evakuace.', sk: 'Teraz alebo nikdy: hor sa na miesto evakuácie.',
      hu: 'Most vagy soha: irány a kimentési pont!', ro: 'Acum sau niciodată: spre punctul de extracție.',
      bg: 'Сега или никога: към точката за изтегляне.', el: 'Τώρα ή ποτέ: όλοι στο σημείο διαφυγής.',
      hr: 'Sad ili nikad: put pod noge do točke izvlačenja.', sl: 'Zdaj ali nikoli: na pot do točke izvleka.',
      et: 'Nüüd või mitte kunagi: väljapääsupunkti poole!', lv: 'Tagad vai nekad: uz evakuācijas punktu!',
      lt: 'Dabar arba niekada: į evakuacijos tašką!', ga: 'Anois nó riamh: ar aghaidh chuig an bpointe éalaithe.',
      mt: 'Issa jew qatt: lejn il-punt tal-ħarba.',
    },
  },
  {
    id: 'extra-hunter',
    icon: '👁️',
    title: {
      nl: 'Extra Hunter op straat', en: 'Extra Hunter on the streets', de: 'Zusätzlicher Hunter unterwegs', fr: 'Un Hunter de plus dans les rues',
      es: 'Un Hunter más en la calle', it: 'Un Hunter in più per le strade', pt: 'Mais um Hunter na rua', da: 'Ekstra Hunter på gaden',
      sv: 'Extra Hunter ute på gatorna', no: 'Ekstra Hunter i gatene', fi: 'Ylimääräinen Hunter liikkeellä', pl: 'Dodatkowy Hunter na ulicach',
      cs: 'Další Hunter v ulicích', sk: 'Ďalší Hunter v uliciach', hu: 'Még egy Hunter az utcán', ro: 'Încă un Hunter pe stradă',
      bg: 'Още един Hunter на улицата', el: 'Ένας Hunter ακόμα στους δρόμους', hr: 'Dodatni Hunter na ulicama', sl: 'Dodaten Hunter na ulicah',
      et: 'Lisa-Hunter tänavatel', lv: 'Vēl viens Hunter ielās', lt: 'Dar vienas Hunter gatvėse', ga: 'Hunter breise ar na sráideanna',
      mt: 'Hunter ieħor fit-toroq',
    },
    body: {
      nl: 'Er jaagt vanaf nu een Hunter meer op jullie.', en: 'From now on, one more Hunter is after you.',
      de: 'Ab jetzt ist ein Hunter mehr hinter euch her.', fr: "À partir de maintenant, un Hunter de plus est à vos trousses.",
      es: 'A partir de ahora os persigue un Hunter más.', it: "Da adesso c'è un Hunter in più a darvi la caccia.",
      pt: 'A partir de agora há mais um Hunter atrás de vocês.', da: 'Fra nu af er der én Hunter mere efter jer.',
      sv: 'Från och med nu jagar ytterligare en Hunter er.', no: 'Fra nå av er det én Hunter til på jakt etter dere.',
      fi: 'Tästä lähtien teitä jahtaa yksi Hunter enemmän.', pl: 'Od teraz poluje na was o jednego Huntera więcej.',
      cs: 'Od teď po vás jde o jednoho Huntera víc.', sk: 'Odteraz po vás ide o jedného Huntera viac.',
      hu: 'Mostantól eggyel több Hunter vadászik rátok.', ro: 'De acum, încă un Hunter vă vânează.',
      bg: 'Отсега нататък ви преследва още един Hunter.', el: 'Από τώρα σας κυνηγάει ένας Hunter ακόμα.',
      hr: 'Od sada vas lovi jedan Hunter više.', sl: 'Od zdaj vas lovi en Hunter več.',
      et: 'Nüüdsest jahib teid üks Hunter rohkem.', lv: 'No šī brīža jūs medī vēl viens Hunter.',
      lt: 'Nuo šiol jus medžioja dar vienas Hunter.', ga: 'Ó seo amach, tá Hunter breise sa tóir oraibh.',
      mt: 'Minn issa \u2019l quddiem hemm Hunter ieħor warajkom.',
    },
  },
  {
    id: 'hunters-op-jacht',
    icon: '🔥',
    title: {
      nl: 'Hunters op jacht', en: 'Hunters on the prowl', de: 'Hunters auf der Jagd', fr: 'Les Hunters sont en chasse',
      es: 'Hunters de cacería', it: 'Hunters a caccia', pt: 'Hunters à caça', da: 'Hunters på jagt', sv: 'Hunters på jakt',
      no: 'Hunters på jakt', fi: 'Hunterit saalistamassa', pl: 'Hunterzy polują', cs: 'Hunteři na lovu', sk: 'Hunteri na love',
      hu: 'Vadásznak a Hunterek', ro: 'Hunterii sunt la vânătoare', bg: 'Hunters са на лов', el: 'Οι Hunters κυνηγούν',
      hr: 'Hunteri u lovu', sl: 'Hunterji na lovu', et: 'Hunterid jahil', lv: 'Hunteri medībās', lt: 'Hunteriai medžioja',
      ga: 'Na Hunters ag fiach', mt: 'Il-Hunters għaddejjin bil-kaċċa',
    },
    body: {
      nl: 'De Hunters zijn extra actief. Blijf uit het zicht!', en: 'The Hunters are extra active. Stay out of sight!',
      de: 'Die Hunters sind besonders aktiv. Bleibt außer Sicht!', fr: 'Les Hunters sont très actifs. Restez hors de vue !',
      es: 'Los Hunters están más activos que nunca. ¡Que no os vean!', it: 'Gli Hunters sono più attivi che mai. Non fatevi vedere!',
      pt: 'Os Hunters estão mais ativos do que nunca. Não se deixem ver!', da: 'Hunterne er ekstra aktive. Hold jer ude af syne!',
      sv: 'Hunterna är extra aktiva. Håll er ur sikte!', no: 'Hunterne er ekstra aktive. Hold dere ute av syne!',
      fi: 'Hunterit ovat erityisen aktiivisia. Pysykää piilossa!', pl: 'Hunterzy są wyjątkowo aktywni. Nie dajcie się zauważyć!',
      cs: 'Hunteři jsou mimořádně aktivní. Nenechte se vidět!', sk: 'Hunteri sú mimoriadne aktívni. Nedajte sa vidieť!',
      hu: 'A Hunterek most különösen aktívak. Maradjatok rejtve!', ro: 'Hunterii sunt foarte activi. Nu vă lăsați văzuți!',
      bg: 'Hunters са особено активни. Не се показвайте!', el: 'Οι Hunters είναι πολύ δραστήριοι. Μείνετε κρυμμένοι!',
      hr: 'Hunteri su posebno aktivni. Ne dajte se vidjeti!', sl: 'Hunterji so še posebej dejavni. Ostanite skriti!',
      et: 'Hunterid on eriti aktiivsed. Püsige varjus!', lv: 'Hunteri ir īpaši aktīvi. Turieties nepamanīti!',
      lt: 'Hunteriai ypač aktyvūs. Nesirodykite!', ga: 'Tá na Hunters an-ghníomhach. Fanaigí as radharc!',
      mt: 'Il-Hunters attivi aktar mis-soltu. Toqogħdux jidhru!',
    },
  },
  {
    id: 'hunters-op-pauze',
    icon: '☕',
    title: {
      nl: 'Hunters op pauze', en: 'Hunters on a break', de: 'Hunters machen Pause', fr: 'Les Hunters font une pause',
      es: 'Los Hunters descansan', it: 'Hunters in pausa', pt: 'Hunters em pausa', da: 'Hunters holder pause', sv: 'Hunters tar paus',
      no: 'Hunters tar pause', fi: 'Hunterit tauolla', pl: 'Hunterzy mają przerwę', cs: 'Hunteři mají pauzu', sk: 'Hunteri majú prestávku',
      hu: 'Szünetel a Hunterek', ro: 'Hunterii iau o pauză', bg: 'Hunters са в почивка', el: 'Οι Hunters κάνουν διάλειμμα',
      hr: 'Hunteri na pauzi', sl: 'Hunterji imajo odmor', et: 'Hunterid puhkavad', lv: 'Hunteriem pārtraukums', lt: 'Hunteriai ilsisi',
      ga: 'Sos ag na Hunters', mt: 'Il-Hunters fil-waqfa',
    },
    body: {
      nl: 'De Hunters nemen even pauze. Dit is jullie kans!', en: 'The Hunters are taking a short break. This is your chance!',
      de: 'Die Hunters machen kurz Pause. Das ist eure Chance!', fr: "Les Hunters font une courte pause. C'est votre chance !",
      es: 'Los Hunters se toman un descanso. ¡Es vuestra oportunidad!', it: "Gli Hunters fanno una breve pausa. È la vostra occasione!",
      pt: 'Os Hunters fazem uma pequena pausa. É a vossa oportunidade!', da: 'Hunterne holder en kort pause. Det er jeres chance!',
      sv: 'Hunterna tar en kort paus. Det här är er chans!', no: 'Hunterne tar en kort pause. Dette er sjansen deres!',
      fi: 'Hunterit pitävät lyhyen tauon. Nyt on teidän tilaisuutenne!', pl: 'Hunterzy robią krótką przerwę. To wasza szansa!',
      cs: 'Hunteři si dávají krátkou pauzu. To je vaše šance!', sk: 'Hunteri si dávajú krátku prestávku. To je vaša šanca!',
      hu: 'A Hunterek rövid szünetet tartanak. Itt a lehetőség!', ro: 'Hunterii iau o scurtă pauză. Aceasta este șansa voastră!',
      bg: 'Hunters си почиват за малко. Това е вашият шанс!', el: 'Οι Hunters κάνουν ένα μικρό διάλειμμα. Αυτή είναι η ευκαιρία σας!',
      hr: 'Hunteri su na kratkoj pauzi. Ovo je vaša prilika!', sl: 'Hunterji imajo kratek odmor. To je vaša priložnost!',
      et: 'Hunterid teevad lühikese pausi. See on teie võimalus!', lv: 'Hunteri ieturē īsu pārtraukumu. Šī ir jūsu iespēja!',
      lt: 'Hunteriai trumpai ilsisi. Tai jūsų proga!', ga: 'Tá sos gearr ag na Hunters. Seo bhur seans!',
      mt: 'Il-Hunters qed jieħdu waqfa qasira. Din iċ-ċans tagħkom!',
    },
  },
  {
    id: 'telefoon-bij-de-hand',
    icon: '📞',
    title: {
      nl: 'Houd je telefoon bij de hand', en: 'Keep your phone at hand', de: 'Haltet euer Handy bereit', fr: 'Gardez votre téléphone à portée de main',
      es: 'Tened el móvil a mano', it: 'Tenete il telefono a portata di mano', pt: 'Tenham o telemóvel à mão', da: 'Hav telefonen klar',
      sv: 'Ha telefonen nära till hands', no: 'Ha telefonen klar', fi: 'Pitäkää puhelin käden ulottuvilla', pl: 'Miejcie telefon pod ręką',
      cs: 'Mějte telefon po ruce', sk: 'Majte telefón po ruke', hu: 'Legyen kéznél a telefon', ro: 'Țineți telefonul la îndemână',
      bg: 'Дръжте телефона си подръка', el: 'Έχετε το τηλέφωνο κοντά σας', hr: 'Držite mobitel pri ruci', sl: 'Imejte telefon pri roki',
      et: 'Hoidke telefon käepärast', lv: 'Turiet tālruni pa rokai', lt: 'Laikykite telefoną po ranka', ga: 'Coinnígí an fón in aice láimhe',
      mt: 'Żommu t-telefon f’idejkom',
    },
    body: {
      nl: 'De spelleiding belt zo een van de teams.', en: 'The game master is about to call one of the teams.',
      de: 'Die Spielleitung ruft gleich eines der Teams an.', fr: "L'organisation va bientôt appeler l'une des équipes.",
      es: 'La organización va a llamar enseguida a uno de los equipos.', it: "L'organizzazione chiamerà a breve una delle squadre.",
      pt: 'A organização vai ligar em breve a uma das equipas.', da: 'Spillederen ringer snart til et af holdene.',
      sv: 'Spelledningen ringer snart upp ett av lagen.', no: 'Spillederen ringer snart til et av lagene.',
      fi: 'Pelinjohto soittaa pian yhdelle joukkueista.', pl: 'Prowadzący zaraz zadzwoni do jednej z drużyn.',
      cs: 'Organizátoři za chvíli zavolají jednomu z týmů.', sk: 'Organizátori o chvíľu zavolajú jednému z tímov.',
      hu: 'A játékvezetés hamarosan felhívja az egyik csapatot.', ro: 'Organizatorii vor suna în curând una dintre echipe.',
      bg: 'Организаторите скоро ще се обадят на един от отборите.', el: 'Η οργάνωση θα τηλεφωνήσει σύντομα σε μία από τις ομάδες.',
      hr: 'Voditelj igre uskoro zove jednu od ekipa.', sl: 'Vodja igre bo kmalu poklical eno od ekip.',
      et: 'Mängujuht helistab kohe ühele võistkondadest.', lv: 'Spēles vadītājs drīz zvanīs vienai no komandām.',
      lt: 'Žaidimo vedėjas netrukus paskambins vienai iš komandų.', ga: 'Glaofaidh an t-eagraí ar cheann de na foirne go luath.',
      mt: 'L-organizzaturi se jċemplu lil wieħed mit-timijiet dalwaqt.',
    },
  },
];

/**
 * Speeltijd in minuten als het spel eindigt na een vaste tijd: de kortste
 * regel "na x minuten → einde". Zonder zo'n regel `undefined`.
 */
export function gameTimeLimitMinutes(game: Pick<GamePackage, 'rules'>): number | undefined {
  let limit: number | undefined;
  for (const rule of game.rules as Rule[]) {
    if (rule.when.kind !== 'elapsed' || !rule.then.some((a) => a.kind === 'end')) continue;
    if (rule.when.minutes > 0 && (limit === undefined || rule.when.minutes < limit)) limit = rule.when.minutes;
  }
  return limit;
}

/** Is dit einde een ontsnapping (het juiste extractiepunt, met bonus)? */
export function isEscapeEnding(game: Pick<GamePackage, 'endings'>, ending: string | undefined): boolean {
  if (!ending) return false;
  return (game.endings.find((e) => e.id === ending)?.bonus ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Afgelegde afstand, onderweg bijgehouden
// ---------------------------------------------------------------------------

/** Tussenstand van `DistanceMeter`, om op de telefoon te bewaren. */
export interface DistanceProgress {
  meters: number;
  anchor?: { lat: number; lng: number };
  lastAt?: number;
}

/**
 * Telt de afgelegde afstand op terwijl de metingen binnenkomen, met dezelfde
 * regels als `routeDistance` en de databasefunctie `team_distance`: alleen
 * nauwkeurige metingen, geen ruis bij stilstaan en geen sprongen.
 */
export function addDistance(progress: DistanceProgress, fix: GpsFix, maxAccuracy = 30, minStep = 5, maxSpeed = 8): DistanceProgress {
  if (fix.accuracy < 0 || fix.accuracy > maxAccuracy) return progress;
  if (!progress.anchor || progress.lastAt === undefined) return { meters: progress.meters, anchor: { lat: fix.lat, lng: fix.lng }, lastAt: fix.at };
  if (fix.at <= progress.lastAt) return progress;
  const step = distanceMeters(progress.anchor, fix);
  const seconds = (fix.at - progress.lastAt) / 1000;
  if (step < minStep) return { ...progress, lastAt: fix.at };
  if (step / seconds > maxSpeed) return { ...progress, lastAt: fix.at };
  return { meters: progress.meters + step, anchor: { lat: fix.lat, lng: fix.lng }, lastAt: fix.at };
}

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------

export const BADGES = [
  'escaped',
  'neverCaught',
  'firstOut',
  'fastest',
  'noHints',
  'marathon',
  'photographer',
  'lastMinute',
  'comeback',
] as const;
export type Badge = (typeof BADGES)[number];

export const BADGE_ICONS: Record<Badge, string> = {
  escaped: '🏁',
  neverCaught: '🛡️',
  firstOut: '🥇',
  fastest: '⚡',
  noHints: '🧠',
  marathon: '👟',
  photographer: '📸',
  lastMinute: '⏱️',
  comeback: '💪',
};

/** Wat de server weet over alle teams van de hunt (zie `team_summary`). */
export interface HuntRecords {
  /** Eerste team bij het juiste extractiepunt. */
  firstEscapeTeam?: string | null;
  /** Eerste team dat een puzzel oploste. */
  firstPuzzleTeam?: string | null;
  /** Team met de meeste kilometers. */
  mostDistanceTeam?: string | null;
  /** Team met de meeste foto's en video's. */
  mostPhotosTeam?: string | null;
}

/** Ontsnapt binnen zoveel ms voor het einde van de speeltijd: "Op het nippertje". */
export const LAST_MINUTE_MS = 2 * 60_000;

/**
 * Badges van een team aan het einde van het spel. Wat alleen dit team betreft
 * rekent de app zelf uit; wie de eerste of de meeste was komt van de server.
 */
export function earnedBadges(input: {
  game: GamePackage;
  state: TeamState;
  events: readonly GameEvent[];
  teamId: string;
  startedAt: number;
  records?: HuntRecords | null;
}): Badge[] {
  const { game, state, events, teamId, startedAt, records } = input;
  if (!state.ended) return [];
  const escaped = isEscapeEnding(game, state.ended.ending);
  const caught = events.some((e) => e.type === 'caught');
  const solved = puzzleTasks(game).filter((task) => state.tasks[task.id]?.correct === true).length;
  const limit = gameTimeLimitMinutes(game);
  const left = limit === undefined ? Infinity : startedAt + limit * 60_000 - state.ended.at;
  const out = new Set<Badge>();
  if (escaped) out.add('escaped');
  if (!caught) out.add('neverCaught');
  if (escaped && records?.firstEscapeTeam === teamId) out.add('firstOut');
  if (records?.firstPuzzleTeam === teamId) out.add('fastest');
  if (solved > 0 && !events.some((e) => e.type === 'hintUsed')) out.add('noHints');
  if (records?.mostDistanceTeam === teamId) out.add('marathon');
  if (records?.mostPhotosTeam === teamId) out.add('photographer');
  if (escaped && left >= 0 && left <= LAST_MINUTE_MS) out.add('lastMinute');
  if (escaped && caught) out.add('comeback');
  return BADGES.filter((b) => out.has(b));
}
