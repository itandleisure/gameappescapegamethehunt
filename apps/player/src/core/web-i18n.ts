/**
 * Teksten die alleen de webapp (speler-app in de browser) laat zien: scherm
 * aan houden, GPS weggevallen, op het beginscherm zetten. Andere talen dan
 * deze vallen terug op Engels.
 */

const nl = {
  webKeepOnTitle: 'Houd dit scherm aan',
  webKeepOnBody:
    'Laat deze pagina open en het scherm aan tijdens het spel. Vergrendel de telefoon niet en ga niet naar een andere app (zoals WhatsApp of de camera). Anders stopt de locatie en openen opdrachten niet vanzelf.',
  webBattery: 'Het scherm staat het hele spel aan. Laad de telefoon vooraf op of neem een powerbank mee.',
  webInstallIos: 'Tip: tik onderin op Delen (vierkantje met pijl) en kies "Zet op beginscherm". Dan staat het spel als app op je telefoon.',
  webInstall: 'Op beginscherm zetten',
  webGpsLost: 'Geen GPS-signaal. Houd deze pagina open en het scherm aan, en kijk of locatie aan staat.',
  webGpsDenied:
    'De browser mag je locatie niet gebruiken. Sta locatie toe voor deze website: tik op het slotje of "aA" in de adresbalk. iPhone: Instellingen › Privacy › Locatievoorzieningen › Safari-websites › Tijdens gebruik.',
  webAway: 'Het spel was {time} niet in beeld. In die tijd stond de GPS uit. Tik om te sluiten.',
  webScreenUnsupported: 'Deze browser kan het scherm niet zelf aan houden. Zet automatisch vergrendelen even uit in de instellingen van je telefoon.',
};

type WebKey = keyof typeof nl;
type WebMessages = Record<WebKey, string>;

const en: WebMessages = {
  webKeepOnTitle: 'Keep this screen on',
  webKeepOnBody:
    "Keep this page open and the screen on during the game. Don't lock your phone or switch to another app (like WhatsApp or the camera). Otherwise location stops and tasks won't open by themselves.",
  webBattery: 'The screen stays on for the whole game. Charge your phone beforehand or bring a power bank.',
  webInstallIos: 'Tip: tap Share (square with arrow) at the bottom and choose "Add to Home Screen". The game then sits on your phone like an app.',
  webInstall: 'Add to home screen',
  webGpsLost: 'No GPS signal. Keep this page open and the screen on, and check that location is turned on.',
  webGpsDenied:
    'The browser may not use your location. Allow location for this website: tap the lock or "aA" in the address bar. iPhone: Settings › Privacy › Location Services › Safari Websites › While Using.',
  webAway: 'The game was out of view for {time}. GPS was off during that time. Tap to close.',
  webScreenUnsupported: "This browser can't keep the screen on by itself. Turn off auto-lock for now in your phone's settings.",
};

const de: WebMessages = {
  webKeepOnTitle: 'Lasst diesen Bildschirm an',
  webKeepOnBody:
    'Lasst diese Seite während des Spiels geöffnet und den Bildschirm an. Sperrt das Handy nicht und wechselt nicht in eine andere App (z. B. WhatsApp oder die Kamera). Sonst stoppt der Standort und Aufgaben öffnen sich nicht von selbst.',
  webBattery: 'Der Bildschirm bleibt das ganze Spiel über an. Ladet das Handy vorher auf oder nehmt eine Powerbank mit.',
  webInstallIos: 'Tipp: Tippt unten auf Teilen (Quadrat mit Pfeil) und wählt „Zum Home-Bildschirm“. Dann ist das Spiel wie eine App auf dem Handy.',
  webInstall: 'Zum Startbildschirm hinzufügen',
  webGpsLost: 'Kein GPS-Signal. Lasst diese Seite geöffnet und den Bildschirm an und prüft, ob der Standort eingeschaltet ist.',
  webGpsDenied:
    'Der Browser darf euren Standort nicht verwenden. Erlaubt den Standort für diese Website: Tippt auf das Schloss oder „aA“ in der Adressleiste. iPhone: Einstellungen › Datenschutz › Ortungsdienste › Safari-Websites › Beim Verwenden.',
  webAway: 'Das Spiel war {time} nicht im Bild. In dieser Zeit war das GPS aus. Tippen zum Schließen.',
  webScreenUnsupported: 'Dieser Browser kann den Bildschirm nicht selbst anlassen. Schaltet die automatische Sperre kurz in den Einstellungen aus.',
};

const fr: WebMessages = {
  webKeepOnTitle: "Gardez cet écran allumé",
  webKeepOnBody:
    "Laissez cette page ouverte et l'écran allumé pendant le jeu. Ne verrouillez pas le téléphone et ne passez pas à une autre app (comme WhatsApp ou l'appareil photo). Sinon la localisation s'arrête et les missions ne s'ouvrent plus toutes seules.",
  webBattery: "L'écran reste allumé pendant tout le jeu. Chargez le téléphone avant ou prenez une batterie externe.",
  webInstallIos: "Astuce : touchez Partager (carré avec flèche) en bas et choisissez « Sur l'écran d'accueil ». Le jeu sera alors sur votre téléphone comme une app.",
  webInstall: "Ajouter à l'écran d'accueil",
  webGpsLost: "Pas de signal GPS. Gardez cette page ouverte et l'écran allumé, et vérifiez que la localisation est activée.",
  webGpsDenied:
    "Le navigateur ne peut pas utiliser votre position. Autorisez la localisation pour ce site : touchez le cadenas ou « aA » dans la barre d'adresse. iPhone : Réglages › Confidentialité › Service de localisation › Sites web Safari › Lorsque l'app est active.",
  webAway: "Le jeu n'était pas affiché pendant {time}. Le GPS était coupé pendant ce temps. Touchez pour fermer.",
  webScreenUnsupported: "Ce navigateur ne peut pas garder l'écran allumé. Désactivez le verrouillage automatique dans les réglages du téléphone.",
};

const es: WebMessages = {
  webKeepOnTitle: 'Mantened esta pantalla encendida',
  webKeepOnBody:
    'Dejad esta página abierta y la pantalla encendida durante el juego. No bloqueéis el móvil ni cambiéis a otra app (como WhatsApp o la cámara). Si no, la ubicación se detiene y las misiones no se abren solas.',
  webBattery: 'La pantalla está encendida todo el juego. Cargad el móvil antes o llevad una batería externa.',
  webInstallIos: 'Consejo: tocad Compartir (cuadrado con flecha) abajo y elegid «Añadir a pantalla de inicio». Así el juego queda en el móvil como una app.',
  webInstall: 'Añadir a la pantalla de inicio',
  webGpsLost: 'Sin señal GPS. Dejad esta página abierta y la pantalla encendida, y comprobad que la ubicación está activada.',
  webGpsDenied:
    'El navegador no puede usar vuestra ubicación. Permitid la ubicación para esta web: tocad el candado o «aA» en la barra de direcciones. iPhone: Ajustes › Privacidad › Localización › Sitios web de Safari › Mientras se usa.',
  webAway: 'El juego no estuvo en pantalla durante {time}. En ese tiempo el GPS estuvo apagado. Tocad para cerrar.',
  webScreenUnsupported: 'Este navegador no puede mantener la pantalla encendida. Desactivad el bloqueo automático en los ajustes del móvil.',
};

const pt: WebMessages = {
  webKeepOnTitle: 'Mantenham este ecrã ligado',
  webKeepOnBody:
    'Deixem esta página aberta e o ecrã ligado durante o jogo. Não bloqueiem o telemóvel nem mudem para outra app (como o WhatsApp ou a câmara). Caso contrário, a localização para e as missões não abrem sozinhas.',
  webBattery: 'O ecrã fica ligado durante todo o jogo. Carreguem o telemóvel antes ou levem uma powerbank.',
  webInstallIos: 'Dica: toquem em Partilhar (quadrado com seta) em baixo e escolham «Adicionar ao ecrã principal». O jogo fica no telemóvel como uma app.',
  webInstall: 'Adicionar ao ecrã principal',
  webGpsLost: 'Sem sinal de GPS. Deixem esta página aberta e o ecrã ligado, e confirmem que a localização está ativada.',
  webGpsDenied:
    'O navegador não pode usar a vossa localização. Permitam a localização para este site: toquem no cadeado ou em «aA» na barra de endereço. iPhone: Definições › Privacidade › Serviços de localização › Sites do Safari › Durante a utilização.',
  webAway: 'O jogo esteve fora do ecrã durante {time}. Nesse tempo o GPS esteve desligado. Toquem para fechar.',
  webScreenUnsupported: 'Este navegador não consegue manter o ecrã ligado. Desativem o bloqueio automático nas definições do telemóvel.',
};

const it: WebMessages = {
  webKeepOnTitle: 'Tenete acceso questo schermo',
  webKeepOnBody:
    "Lasciate aperta questa pagina e lo schermo acceso durante il gioco. Non bloccate il telefono e non passate a un'altra app (come WhatsApp o la fotocamera). Altrimenti la posizione si ferma e le missioni non si aprono da sole.",
  webBattery: 'Lo schermo resta acceso per tutto il gioco. Caricate il telefono prima o portate un powerbank.',
  webInstallIos: 'Suggerimento: toccate Condividi (quadrato con freccia) in basso e scegliete «Aggiungi alla schermata Home». Il gioco sarà sul telefono come un\'app.',
  webInstall: 'Aggiungi alla schermata Home',
  webGpsLost: 'Nessun segnale GPS. Lasciate aperta questa pagina e lo schermo acceso, e controllate che la posizione sia attiva.',
  webGpsDenied:
    'Il browser non può usare la vostra posizione. Consentite la posizione per questo sito: toccate il lucchetto o «aA» nella barra degli indirizzi. iPhone: Impostazioni › Privacy › Localizzazione › Siti web di Safari › Mentre usi l\'app.',
  webAway: 'Il gioco non è stato visibile per {time}. In quel tempo il GPS era spento. Toccate per chiudere.',
  webScreenUnsupported: 'Questo browser non riesce a tenere acceso lo schermo. Disattivate il blocco automatico nelle impostazioni del telefono.',
};

const WEB_MESSAGES: Record<string, WebMessages> = { nl, en, de, fr, es, pt, it };

export function webMsg(lang: string, key: WebKey, vars: Record<string, string | number> = {}): string {
  const text = (WEB_MESSAGES[lang] ?? en)[key];
  return text.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`));
}

export type { WebKey };

/** Korte duur voor de melding "even weg": "45 sec" of "3 min" (zelfde in al deze talen). */
export function shortDuration(ms: number): string {
  const s = Math.max(1, Math.round(ms / 1000));
  return s < 60 ? `${s} sec` : `${Math.round(s / 60)} min`;
}
