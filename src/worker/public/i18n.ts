/**
 * Finder-page copy. English is the source of truth; German (formal "Sie") and Spanish ("tú")
 * must have exactly the same keys, which the compiler enforces through `Dict`.
 */
import type { ProposalKind, ProposalStatus } from "../../shared/schemas";
import type { Language } from "../../shared/settings";

export const en = {
  common: {
    skipLink: "Skip to content",
    language: "Language",
    privacy: "Privacy",
    tagline: "RETURN helps lost belongings find their way home.",
    close: "Close",
  },
  home: {
    title: "RETURN",
    lead: "RETURN is a private lost-and-found service for personal belongings.",
    body: "If you found an item with a RETURN tag, scan its QR code or tap its NFC tag. You can then write to the owner without an account or an app.",
    noData: "This page contains no personal data.",
  },
  inactive: {
    title: "This tag is not active",
    body: "The tag was deactivated or the link is incomplete. If you found something, please use the e-mail address printed on the tag or card.",
  },
  tag: {
    belongsTo: "Belongs to {name}",
    foundIt: "You found something that belongs to someone.",
    lostBadge: "Reported lost",
    reward: "Reward",
    ownerNote: "Note from the owner",
    defaultReturn:
      "Thank you for helping. Send a short message below and we will arrange how to get it back to its owner.",
    defaultLost:
      "The owner is looking for this item right now. Please get in touch as soon as you can. Thank you!",
    continueConversation: "Continue your conversation",
    writeHeading: "Write to the owner",
    writeIntro:
      "Your message goes straight to the owner. No account and no app needed. You do not have to give your name.",
    otherWays: "Other ways to reach the owner",
    email: "E-mail",
    phone: "Phone",
    whatsapp: "WhatsApp",
    trusted: "Trusted contact",
  },
  form: {
    message: "Your message",
    messageHint: "For example: where the item is now and when you can hand it over.",
    name: "Your name",
    email: "Your e-mail",
    emailHint: "Optional. Only used to send you your private link and replies.",
    optional: "optional",
    send: "Send message",
    verify: "Quick check that you are not a robot",
    locationHeading: "Where did you find it?",
    locationIntro: "Optional. It is shared only with the owner of this item.",
    locationLabel: "Place or description",
    locationUse: "Use my current position",
    locationConsent:
      "Tapping the button shares your point and its accuracy with the owner of this item only.",
    locationLocating: "Finding your position…",
    locationRefining: "Improving accuracy…",
    locationPreview: "Your position",
    locationAttached: "Position added",
    locationRemove: "Remove",
    locationUpdate: "Update",
    locationRemoved: "Position removed",
    locationWaiting: "Waiting for your position. Your message is sent as soon as it is found.",
    locationDenied: "Location access is turned off for this page.",
    locationGuideIos:
      "On iPhone: open Settings › Privacy & Security › Location Services › Safari Websites and choose “While Using the App”. Or tap “aA” in the address bar › Website Settings › Location › Allow. Then try again.",
    locationGuideAndroid:
      "In Chrome: tap the icon left of the address › Permissions (or Site settings) › Location › Allow. Also check that Location is switched on in your quick settings. Then try again.",
    locationGuideOther:
      "Allow location for this site in your browser's address bar or site settings, then try again.",
    locationUnavailable: "Your position is not available right now.",
    locationTimeout: "Finding your position took too long.",
    locationRetry: "Try again",
    locationDescribe: "Describe the place instead",
    locationWebviewIos:
      "Location often does not work inside this app. Open this page in Safari to use your position.",
    locationWebviewAndroid:
      "Location often does not work inside this app. Open this page in Chrome to use your position.",
    locationWebviewOther:
      "Location often does not work inside this app. Open this page in your browser to use your position.",
    sendFailed: "Could not send. Check your connection and try again.",
    reply: "Your reply",
    sendReply: "Send reply",
    shareLocation: "Share where you are",
    shareLocationSend: "Share location",
    proposeHeading: "Propose a return plan",
    proposeKind: "Type",
    proposePlace: "Place",
    proposeWhen: "Date and time",
    proposeInstructions: "Instructions",
    proposeSend: "Send return plan",
  },
  conv: {
    title: "Your conversation",
    saveTitle: "Save this private link to come back",
    saveBody: "Anyone with this link can read and write in this conversation. Do not share it.",
    copy: "Copy link",
    copied: "Link copied",
    thread: "Messages",
    you: "You",
    owner: "Owner",
    system: "RETURN",
    sharedByYou: "Shared by you",
    sharedByOwner: "Shared by the owner",
    openGoogle: "Open in Google Maps",
    mapGoogle: "Google Maps",
    mapApple: "Apple Maps",
    openApple: "Open in Apple Maps",
    proposals: "Return plan",
    proposedByYou: "Proposed by you",
    proposedByOwner: "Proposed by the owner",
    accept: "Accept",
    decline: "Decline",
    cancel: "Cancel return plan",
    agreed: "Agreed",
    when: "When",
    instructions: "Instructions",
    closedNotice: "This conversation is closed. You can still read it, but it can no longer be answered.",
    emptyThread: "No messages yet.",
    approx: "about {n} m",
    privacyNote: "Read how your data is handled",
    newMessage: "New message",
    more: "Share a place or propose a return plan",
    info: "Private link and privacy",
    share: "Share link",
    shareTitle: "Private RETURN conversation",
  },
  errors: {
    generic: "Something went wrong. Please try again.",
    notFound: "We could not find this page.",
    closed: "This conversation is closed.",
    tryLater: "We cannot take your request right now. Please try again later.",
    forbidden: "This request was rejected. Please reload the page and try again.",
    notAllowed: "This action is not available.",
    pending: "This return plan has already been answered.",
    tooLarge: "The request is too large.",
    verification: "The check could not be completed. Please try again.",
    message: "Please write a message (up to 4000 characters).",
    name: "The name is too long (up to 80 characters).",
    email: "Please enter a valid e-mail address.",
    location: "Please describe the place or use your position.",
    place: "Please say where (up to 300 characters).",
    kind: "Please choose a type.",
    when: "Please enter a valid date and time.",
    whenPast: "That time has already passed. Please choose a later date and time.",
    instructions: "The instructions are too long (up to 1000 characters).",
    fixFields: "Please check the highlighted fields.",
    badForm: "This form could not be read. Please reload the page and try again.",
    dailyLimit: "You have reached today's limit for this conversation. Please try again tomorrow.",
    cantSend:
      "We could not send your message right now. What you typed is still here. Please try again later or use another way to reach the owner.",
    fallbackEmail: "You can also write to:",
  },
  degraded: {
    title: "We cannot load this page right now",
    body: "Our service is temporarily unavailable. Please write to the owner at the e-mail address below and mention what you found.",
    noContact: "Please use the e-mail address printed on the tag or card.",
    tryAgain: "You can also try this page again in a few minutes.",
    yourMessage: "Your message (copy it so it is not lost):",
  },
  emergency: {
    title: "Contact the owner",
    body: "If the normal page does not work, write an e-mail to the owner. Say what you found and where, and how to reach you.",
    noContact: "Please use the e-mail address printed on the tag or card.",
  },
  privacyPage: {
    title: "Privacy",
    storedTitle: "What is stored",
    stored:
      "Your message, and only if you provide them: your name, your e-mail address and a place or position. A position is stored only after you explicitly confirm it. We keep no IP addresses; a one-way code derived from it is used only to stop abuse.",
    seenTitle: "Who sees it",
    seen: "The owner of the item. If the owner has named trusted contacts, they may be told that someone made contact (never your message text). Nobody else, and it is not used for advertising or analytics.",
    processorsTitle: "Service providers",
    processors:
      "Cloudflare processes data on our behalf: it hosts this service, runs the Turnstile bot check (which sees your IP address) and delivers e-mail.",
    recipientsTitle: "Other recipients",
    recipients:
      "When you share a position, its coordinates (and nothing else) are sent to OpenStreetMap's geocoding service (Nominatim), run by the OpenStreetMap Foundation, to show a place name. The Foundation is an independent recipient with its own privacy policy, not a processor acting for us. Place names © OpenStreetMap contributors.",
    retentionTitle: "How long",
    retention:
      "Closed conversations are deleted after the period the owner has set (90 days by default). The owner can delete a conversation at any time. Nightly backups keep a deleted conversation for up to 30 days more. Place names looked up for shared positions are cached for at most 30 days and are removed with the conversation.",
    cookiesTitle: "Cookies and tracking",
    cookies:
      "There is no analytics and no tracking. The only cookie is a strictly necessary one that lets you reopen your conversation on this device.",
    deletionTitle: "Deletion and questions",
    deletion:
      "To have your data deleted, write that in your conversation and the owner will remove it. You can also write to the owner by e-mail if the card shows an address.",
  },
  categories: {
    backpack: "Backpack",
    suitcase: "Suitcase",
    bag: "Bag",
    laptop: "Laptop",
    tablet: "Tablet",
    phone: "Phone",
    camera: "Camera",
    headphones: "Headphones",
    wallet: "Wallet",
    keys: "Keys",
    documents: "Documents",
    clothing: "Clothing",
    other: "Item",
  },
  proposalKinds: {
    meeting_point: "Meeting point",
    public_place: "Public place",
    hotel_reception: "Hotel reception",
    lost_and_found: "Lost and found office",
    shipping: "Shipping",
    other: "Other",
  },
  proposalStatus: {
    proposed: "Waiting for an answer",
    accepted: "Accepted",
    declined: "Declined",
    cancelled: "Cancelled",
    superseded: "Replaced by a newer agreement",
  },
} as const;

type Widen<T> = T extends string ? string : { [K in keyof T]: Widen<T[K]> };
export type Dict = Widen<typeof en>;

const de: Dict = {
  common: {
    skipLink: "Zum Inhalt springen",
    language: "Sprache",
    privacy: "Datenschutz",
    tagline: "RETURN hilft verlorenen Sachen, den Weg nach Hause zu finden.",
    close: "Schließen",
  },
  home: {
    title: "RETURN",
    lead: "RETURN ist ein privater Fundservice für persönliche Gegenstände.",
    body: "Wenn Sie einen Gegenstand mit RETURN-Anhänger gefunden haben, scannen Sie den QR-Code oder halten Sie das Handy an den NFC-Tag. Dann können Sie dem Eigentümer schreiben, ohne Konto und ohne App.",
    noData: "Diese Seite enthält keine persönlichen Daten.",
  },
  inactive: {
    title: "Dieser Anhänger ist nicht aktiv",
    body: "Der Anhänger wurde deaktiviert oder der Link ist unvollständig. Wenn Sie etwas gefunden haben, nutzen Sie bitte die E-Mail-Adresse, die auf dem Anhänger oder der Karte steht.",
  },
  tag: {
    belongsTo: "Gehört {name}",
    foundIt: "Sie haben etwas gefunden, das jemandem gehört.",
    lostBadge: "Als verloren gemeldet",
    reward: "Belohnung",
    ownerNote: "Hinweis des Eigentümers",
    defaultReturn:
      "Danke für Ihre Hilfe. Schreiben Sie unten eine kurze Nachricht, dann klären wir, wie der Gegenstand zum Eigentümer zurückkommt.",
    defaultLost:
      "Der Eigentümer sucht diesen Gegenstand gerade. Bitte melden Sie sich so bald wie möglich. Vielen Dank!",
    continueConversation: "Gespräch fortsetzen",
    writeHeading: "Dem Eigentümer schreiben",
    writeIntro:
      "Ihre Nachricht geht direkt an den Eigentümer. Kein Konto und keine App nötig. Ihren Namen müssen Sie nicht angeben.",
    otherWays: "Weitere Wege, den Eigentümer zu erreichen",
    email: "E-Mail",
    phone: "Telefon",
    whatsapp: "WhatsApp",
    trusted: "Vertrauensperson",
  },
  form: {
    message: "Ihre Nachricht",
    messageHint: "Zum Beispiel: wo der Gegenstand jetzt ist und wann Sie ihn übergeben können.",
    name: "Ihr Name",
    email: "Ihre E-Mail",
    emailHint: "Optional. Wird nur genutzt, um Ihnen Ihren privaten Link und Antworten zu senden.",
    optional: "optional",
    send: "Nachricht senden",
    verify: "Kurzer Check, dass Sie kein Roboter sind",
    locationHeading: "Wo haben Sie es gefunden?",
    locationIntro: "Optional. Wird nur mit dem Eigentümer dieses Gegenstands geteilt.",
    locationLabel: "Ort oder Beschreibung",
    locationUse: "Meinen aktuellen Standort verwenden",
    locationConsent:
      "Mit dem Tippen auf die Schaltfläche teilen Sie Ihren Punkt und seine Genauigkeit nur mit dem Eigentümer dieses Gegenstands.",
    locationLocating: "Standort wird ermittelt…",
    locationRefining: "Genauigkeit wird verbessert…",
    locationPreview: "Ihr Standort",
    locationAttached: "Standort hinzugefügt",
    locationRemove: "Entfernen",
    locationUpdate: "Aktualisieren",
    locationRemoved: "Standort entfernt",
    locationWaiting:
      "Ihr Standort wird noch ermittelt. Ihre Nachricht wird gesendet, sobald er gefunden ist.",
    locationDenied: "Der Standortzugriff ist für diese Seite blockiert.",
    locationGuideIos:
      "Auf dem iPhone: Öffnen Sie Einstellungen › Datenschutz & Sicherheit › Ortungsdienste › Safari-Websites und wählen Sie „Beim Verwenden der App“. Oder tippen Sie in der Adressleiste auf „Aa“ › Website-Einstellungen › Standort › Erlauben. Versuchen Sie es dann erneut.",
    locationGuideAndroid:
      "In Chrome: Tippen Sie auf das Symbol links neben der Adresse › Berechtigungen (oder Website-Einstellungen) › Standort › Zulassen. Prüfen Sie auch, ob der Standort in den Schnelleinstellungen eingeschaltet ist. Versuchen Sie es dann erneut.",
    locationGuideOther:
      "Erlauben Sie den Standort für diese Website in der Adressleiste oder in den Website-Einstellungen Ihres Browsers und versuchen Sie es erneut.",
    locationUnavailable: "Ihr Standort ist gerade nicht verfügbar.",
    locationTimeout: "Die Standortbestimmung hat zu lange gedauert.",
    locationRetry: "Erneut versuchen",
    locationDescribe: "Ort stattdessen beschreiben",
    locationWebviewIos:
      "In dieser App funktioniert der Standort oft nicht. Öffnen Sie diese Seite in Safari, um Ihren Standort zu nutzen.",
    locationWebviewAndroid:
      "In dieser App funktioniert der Standort oft nicht. Öffnen Sie diese Seite in Chrome, um Ihren Standort zu nutzen.",
    locationWebviewOther:
      "In dieser App funktioniert der Standort oft nicht. Öffnen Sie diese Seite in Ihrem Browser, um Ihren Standort zu nutzen.",
    sendFailed: "Senden nicht möglich. Prüfen Sie Ihre Verbindung und versuchen Sie es erneut.",
    reply: "Ihre Antwort",
    sendReply: "Antwort senden",
    shareLocation: "Standort teilen",
    shareLocationSend: "Standort teilen",
    proposeHeading: "Rückgabeplan vorschlagen",
    proposeKind: "Art",
    proposePlace: "Ort",
    proposeWhen: "Datum und Uhrzeit",
    proposeInstructions: "Hinweise",
    proposeSend: "Rückgabeplan senden",
  },
  conv: {
    title: "Ihr Gespräch",
    saveTitle: "Speichern Sie diesen privaten Link, um zurückzukehren",
    saveBody: "Wer diesen Link hat, kann in diesem Gespräch lesen und schreiben. Geben Sie ihn nicht weiter.",
    copy: "Link kopieren",
    copied: "Link kopiert",
    thread: "Nachrichten",
    you: "Sie",
    owner: "Eigentümer",
    system: "RETURN",
    sharedByYou: "Von Ihnen geteilt",
    sharedByOwner: "Vom Eigentümer geteilt",
    openGoogle: "In Google Maps öffnen",
    mapGoogle: "Google Maps",
    mapApple: "Apple Karten",
    openApple: "In Apple Karten öffnen",
    proposals: "Rückgabeplan",
    proposedByYou: "Von Ihnen vorgeschlagen",
    proposedByOwner: "Vom Eigentümer vorgeschlagen",
    accept: "Annehmen",
    decline: "Ablehnen",
    cancel: "Rückgabeplan zurückziehen",
    agreed: "Vereinbart",
    when: "Wann",
    instructions: "Hinweise",
    closedNotice: "Dieses Gespräch ist beendet. Sie können es noch lesen, aber nicht mehr darauf antworten.",
    emptyThread: "Noch keine Nachrichten.",
    approx: "etwa {n} m",
    privacyNote: "So gehen wir mit Ihren Daten um",
    newMessage: "Neue Nachricht",
    more: "Ort teilen oder Rückgabeplan vorschlagen",
    info: "Privater Link und Datenschutz",
    share: "Link teilen",
    shareTitle: "Privates RETURN-Gespräch",
  },
  errors: {
    generic: "Etwas ist schiefgelaufen. Bitte versuchen Sie es erneut.",
    notFound: "Diese Seite wurde nicht gefunden.",
    closed: "Dieses Gespräch ist beendet.",
    tryLater: "Wir können Ihre Anfrage gerade nicht annehmen. Bitte versuchen Sie es später erneut.",
    forbidden: "Die Anfrage wurde abgelehnt. Bitte laden Sie die Seite neu und versuchen Sie es erneut.",
    notAllowed: "Diese Aktion ist nicht verfügbar.",
    pending: "Dieser Rückgabeplan wurde bereits beantwortet.",
    tooLarge: "Die Anfrage ist zu groß.",
    verification: "Der Check konnte nicht abgeschlossen werden. Bitte versuchen Sie es erneut.",
    message: "Bitte schreiben Sie eine Nachricht (bis zu 4000 Zeichen).",
    name: "Der Name ist zu lang (bis zu 80 Zeichen).",
    email: "Bitte geben Sie eine gültige E-Mail-Adresse ein.",
    location: "Bitte beschreiben Sie den Ort oder verwenden Sie Ihren Standort.",
    place: "Bitte geben Sie einen Ort an (bis zu 300 Zeichen).",
    kind: "Bitte wählen Sie eine Art.",
    when: "Bitte geben Sie ein gültiges Datum mit Uhrzeit ein.",
    whenPast: "Dieser Zeitpunkt liegt in der Vergangenheit. Bitte wählen Sie einen späteren Termin.",
    instructions: "Die Hinweise sind zu lang (bis zu 1000 Zeichen).",
    fixFields: "Bitte prüfen Sie die markierten Felder.",
    badForm:
      "Das Formular konnte nicht gelesen werden. Bitte laden Sie die Seite neu und versuchen Sie es erneut.",
    dailyLimit:
      "Sie haben das Tageslimit für dieses Gespräch erreicht. Bitte versuchen Sie es morgen erneut.",
    cantSend:
      "Wir konnten Ihre Nachricht gerade nicht senden. Ihr Text steht noch da. Bitte versuchen Sie es später erneut oder nutzen Sie einen anderen Weg zum Eigentümer.",
    fallbackEmail: "Sie können auch schreiben an:",
  },
  degraded: {
    title: "Diese Seite lässt sich gerade nicht laden",
    body: "Unser Dienst ist vorübergehend nicht erreichbar. Bitte schreiben Sie dem Eigentümer an die E-Mail-Adresse unten und nennen Sie, was Sie gefunden haben.",
    noContact: "Bitte nutzen Sie die E-Mail-Adresse, die auf dem Anhänger oder der Karte steht.",
    tryAgain: "Sie können diese Seite auch in ein paar Minuten erneut versuchen.",
    yourMessage: "Ihre Nachricht (kopieren Sie sie, damit nichts verloren geht):",
  },
  emergency: {
    title: "Den Eigentümer kontaktieren",
    body: "Wenn die normale Seite nicht funktioniert, schreiben Sie dem Eigentümer eine E-Mail. Nennen Sie, was und wo Sie etwas gefunden haben und wie man Sie erreicht.",
    noContact: "Bitte nutzen Sie die E-Mail-Adresse, die auf dem Anhänger oder der Karte steht.",
  },
  privacyPage: {
    title: "Datenschutz",
    storedTitle: "Was gespeichert wird",
    stored:
      "Ihre Nachricht und, nur wenn Sie sie angeben: Ihr Name, Ihre E-Mail-Adresse und ein Ort oder Standort. Ein Standort wird erst gespeichert, nachdem Sie ihn ausdrücklich bestätigt haben. IP-Adressen speichern wir nicht; ein daraus abgeleiteter Einweg-Code dient nur der Missbrauchsabwehr.",
    seenTitle: "Wer es sieht",
    seen: "Der Eigentümer des Gegenstands. Hat der Eigentümer Vertrauenspersonen benannt, erfahren diese möglicherweise, dass jemand Kontakt aufgenommen hat (nie den Text Ihrer Nachricht). Niemand sonst, und es wird nicht für Werbung oder Analyse verwendet.",
    processorsTitle: "Dienstleister",
    processors:
      "Cloudflare verarbeitet Daten in unserem Auftrag: Es hostet diesen Dienst, betreibt die Turnstile-Bot-Prüfung (die Ihre IP-Adresse sieht) und versendet E-Mails.",
    recipientsTitle: "Weitere Empfänger",
    recipients:
      "Wenn Sie einen Standort teilen, werden dessen Koordinaten (und sonst nichts) an den Geocoding-Dienst von OpenStreetMap (Nominatim) gesendet, den die OpenStreetMap Foundation betreibt, um einen Ortsnamen anzuzeigen. Die Foundation ist ein eigenständiger Empfänger mit eigener Datenschutzerklärung, kein Auftragsverarbeiter für uns. Ortsnamen © OpenStreetMap contributors.",
    retentionTitle: "Wie lange",
    retention:
      "Beendete Gespräche werden nach der vom Eigentümer eingestellten Frist gelöscht (standardmäßig 90 Tage). Der Eigentümer kann ein Gespräch jederzeit löschen. Nächtliche Sicherungen bewahren ein gelöschtes Gespräch bis zu 30 Tage länger auf. Für geteilte Standorte nachgeschlagene Ortsnamen werden höchstens 30 Tage zwischengespeichert und mit dem Gespräch entfernt.",
    cookiesTitle: "Cookies und Tracking",
    cookies:
      "Es gibt weder Analyse noch Tracking. Das einzige Cookie ist ein technisch notwendiges, mit dem Sie Ihr Gespräch auf diesem Gerät wieder öffnen können.",
    deletionTitle: "Löschung und Fragen",
    deletion:
      "Um Ihre Daten löschen zu lassen, schreiben Sie das in Ihrem Gespräch; der Eigentümer entfernt sie dann. Sie können dem Eigentümer auch per E-Mail schreiben, wenn auf der Karte eine Adresse steht.",
  },
  categories: {
    backpack: "Rucksack",
    suitcase: "Koffer",
    bag: "Tasche",
    laptop: "Laptop",
    tablet: "Tablet",
    phone: "Handy",
    camera: "Kamera",
    headphones: "Kopfhörer",
    wallet: "Geldbörse",
    keys: "Schlüssel",
    documents: "Dokumente",
    clothing: "Kleidung",
    other: "Gegenstand",
  },
  proposalKinds: {
    meeting_point: "Treffpunkt",
    public_place: "Öffentlicher Ort",
    hotel_reception: "Hotelrezeption",
    lost_and_found: "Fundbüro",
    shipping: "Versand",
    other: "Sonstiges",
  },
  proposalStatus: {
    proposed: "Wartet auf Antwort",
    accepted: "Angenommen",
    declined: "Abgelehnt",
    cancelled: "Zurückgezogen",
    superseded: "Durch eine neuere Vereinbarung ersetzt",
  },
};

const es: Dict = {
  common: {
    skipLink: "Saltar al contenido",
    language: "Idioma",
    privacy: "Privacidad",
    tagline: "RETURN ayuda a que las cosas perdidas vuelvan a casa.",
    close: "Cerrar",
  },
  home: {
    title: "RETURN",
    lead: "RETURN es un servicio privado de objetos perdidos para pertenencias personales.",
    body: "Si has encontrado un objeto con una etiqueta RETURN, escanea su código QR o acerca el móvil a la etiqueta NFC. Así puedes escribir al propietario sin cuenta y sin app.",
    noData: "Esta página no contiene datos personales.",
  },
  inactive: {
    title: "Esta etiqueta no está activa",
    body: "La etiqueta se desactivó o el enlace está incompleto. Si has encontrado algo, usa el correo electrónico impreso en la etiqueta o en la tarjeta.",
  },
  tag: {
    belongsTo: "Pertenece a {name}",
    foundIt: "Has encontrado algo que es de otra persona.",
    lostBadge: "Dado por perdido",
    reward: "Recompensa",
    ownerNote: "Nota del propietario",
    defaultReturn:
      "Gracias por ayudar. Escribe un mensaje breve aquí abajo y acordaremos cómo devolverlo a su propietario.",
    defaultLost:
      "El propietario está buscando este objeto ahora mismo. Ponte en contacto en cuanto puedas. ¡Gracias!",
    continueConversation: "Continuar tu conversación",
    writeHeading: "Escribe al propietario",
    writeIntro:
      "Tu mensaje llega directamente al propietario. No hace falta cuenta ni app. No tienes que dar tu nombre.",
    otherWays: "Otras formas de contactar con el propietario",
    email: "Correo electrónico",
    phone: "Teléfono",
    whatsapp: "WhatsApp",
    trusted: "Persona de confianza",
  },
  form: {
    message: "Tu mensaje",
    messageHint: "Por ejemplo: dónde está ahora el objeto y cuándo puedes entregarlo.",
    name: "Tu nombre",
    email: "Tu correo electrónico",
    emailHint: "Opcional. Solo se usa para enviarte tu enlace privado y las respuestas.",
    optional: "opcional",
    send: "Enviar mensaje",
    verify: "Comprobación rápida de que no eres un robot",
    locationHeading: "¿Dónde lo encontraste?",
    locationIntro: "Opcional. Solo se comparte con el propietario de este objeto.",
    locationLabel: "Lugar o descripción",
    locationUse: "Usar mi posición actual",
    locationConsent:
      "Al tocar el botón compartes tu punto y su precisión solo con el propietario de este objeto.",
    locationLocating: "Buscando tu posición…",
    locationRefining: "Mejorando la precisión…",
    locationPreview: "Tu posición",
    locationAttached: "Posición añadida",
    locationRemove: "Quitar",
    locationUpdate: "Actualizar",
    locationRemoved: "Posición quitada",
    locationWaiting: "Aún se está buscando tu posición. Tu mensaje se enviará en cuanto se encuentre.",
    locationDenied: "La ubicación está bloqueada para esta página.",
    locationGuideIos:
      "En iPhone: abre Ajustes › Privacidad y seguridad › Localización › Sitios web de Safari y elige «Al usar la app». O toca «aA» en la barra de direcciones › Ajustes del sitio web › Ubicación › Permitir. Luego inténtalo de nuevo.",
    locationGuideAndroid:
      "En Chrome: toca el icono a la izquierda de la dirección › Permisos (o Configuración del sitio) › Ubicación › Permitir. Comprueba también que la ubicación esté activada en los ajustes rápidos. Luego inténtalo de nuevo.",
    locationGuideOther:
      "Permite la ubicación para este sitio en la barra de direcciones o en los ajustes del sitio de tu navegador y vuelve a intentarlo.",
    locationUnavailable: "Tu posición no está disponible ahora.",
    locationTimeout: "Encontrar tu posición tardó demasiado.",
    locationRetry: "Reintentar",
    locationDescribe: "Describir el lugar en su lugar",
    locationWebviewIos:
      "La ubicación suele fallar dentro de esta app. Abre esta página en Safari para usar tu posición.",
    locationWebviewAndroid:
      "La ubicación suele fallar dentro de esta app. Abre esta página en Chrome para usar tu posición.",
    locationWebviewOther:
      "La ubicación suele fallar dentro de esta app. Abre esta página en tu navegador para usar tu posición.",
    sendFailed: "No se pudo enviar. Comprueba tu conexión e inténtalo de nuevo.",
    reply: "Tu respuesta",
    sendReply: "Enviar respuesta",
    shareLocation: "Compartir dónde estás",
    shareLocationSend: "Compartir ubicación",
    proposeHeading: "Proponer un plan de devolución",
    proposeKind: "Tipo",
    proposePlace: "Lugar",
    proposeWhen: "Fecha y hora",
    proposeInstructions: "Indicaciones",
    proposeSend: "Enviar plan de devolución",
  },
  conv: {
    title: "Tu conversación",
    saveTitle: "Guarda este enlace privado para volver",
    saveBody: "Quien tenga este enlace puede leer y escribir en esta conversación. No lo compartas.",
    copy: "Copiar enlace",
    copied: "Enlace copiado",
    thread: "Mensajes",
    you: "Tú",
    owner: "Propietario",
    system: "RETURN",
    sharedByYou: "Compartido por ti",
    sharedByOwner: "Compartido por el propietario",
    openGoogle: "Abrir en Google Maps",
    mapGoogle: "Google Maps",
    mapApple: "Apple Maps",
    openApple: "Abrir en Apple Maps",
    proposals: "Plan de devolución",
    proposedByYou: "Propuesto por ti",
    proposedByOwner: "Propuesto por el propietario",
    accept: "Aceptar",
    decline: "Rechazar",
    cancel: "Retirar plan de devolución",
    agreed: "Acordado",
    when: "Cuándo",
    instructions: "Indicaciones",
    closedNotice: "Esta conversación está cerrada. Aún puedes leerla, pero ya no se puede responder.",
    emptyThread: "Todavía no hay mensajes.",
    approx: "unos {n} m",
    privacyNote: "Cómo tratamos tus datos",
    newMessage: "Mensaje nuevo",
    more: "Compartir un lugar o proponer un plan de devolución",
    info: "Enlace privado y privacidad",
    share: "Compartir enlace",
    shareTitle: "Conversación privada de RETURN",
  },
  errors: {
    generic: "Algo salió mal. Inténtalo de nuevo.",
    notFound: "No hemos encontrado esta página.",
    closed: "Esta conversación está cerrada.",
    tryLater: "No podemos atender tu solicitud ahora. Inténtalo de nuevo más tarde.",
    forbidden: "La solicitud fue rechazada. Recarga la página e inténtalo de nuevo.",
    notAllowed: "Esta acción no está disponible.",
    pending: "Este plan de devolución ya fue respondido.",
    tooLarge: "La solicitud es demasiado grande.",
    verification: "No se pudo completar la comprobación. Inténtalo de nuevo.",
    message: "Escribe un mensaje (hasta 4000 caracteres).",
    name: "El nombre es demasiado largo (hasta 80 caracteres).",
    email: "Introduce un correo electrónico válido.",
    location: "Describe el lugar o usa tu posición.",
    place: "Indica dónde (hasta 300 caracteres).",
    kind: "Elige un tipo.",
    when: "Introduce una fecha y hora válidas.",
    whenPast: "Esa hora ya ha pasado. Elige una fecha y hora posteriores.",
    instructions: "Las indicaciones son demasiado largas (hasta 1000 caracteres).",
    fixFields: "Revisa los campos marcados.",
    badForm: "No se pudo leer el formulario. Recarga la página e inténtalo de nuevo.",
    dailyLimit: "Has alcanzado el límite de hoy para esta conversación. Inténtalo de nuevo mañana.",
    cantSend:
      "No pudimos enviar tu mensaje ahora. Lo que escribiste sigue aquí. Inténtalo más tarde o usa otra forma de contactar con el propietario.",
    fallbackEmail: "También puedes escribir a:",
  },
  degraded: {
    title: "No podemos cargar esta página ahora",
    body: "Nuestro servicio no está disponible temporalmente. Escribe al propietario al correo de abajo e indica qué has encontrado.",
    noContact: "Usa el correo electrónico impreso en la etiqueta o en la tarjeta.",
    tryAgain: "También puedes probar de nuevo esta página dentro de unos minutos.",
    yourMessage: "Tu mensaje (cópialo para no perderlo):",
  },
  emergency: {
    title: "Contactar con el propietario",
    body: "Si la página normal no funciona, escribe un correo al propietario. Cuenta qué y dónde has encontrado, y cómo contactarte.",
    noContact: "Usa el correo electrónico impreso en la etiqueta o en la tarjeta.",
  },
  privacyPage: {
    title: "Privacidad",
    storedTitle: "Qué se guarda",
    stored:
      "Tu mensaje y, solo si los das: tu nombre, tu correo electrónico y un lugar o posición. Una posición solo se guarda después de que la confirmes de forma explícita. No guardamos direcciones IP; un código irreversible derivado de ella se usa únicamente para frenar abusos.",
    seenTitle: "Quién lo ve",
    seen: "El propietario del objeto. Si el propietario ha designado personas de confianza, puede que se les avise de que alguien ha contactado (nunca el texto de tu mensaje). Nadie más, y no se usa para publicidad ni analítica.",
    processorsTitle: "Proveedores de servicios",
    processors:
      "Cloudflare trata datos por encargo nuestro: aloja este servicio, ejecuta la comprobación antirrobots Turnstile (que ve tu dirección IP) y entrega el correo electrónico.",
    recipientsTitle: "Otros destinatarios",
    recipients:
      "Cuando compartes una posición, sus coordenadas (y nada más) se envían al servicio de geocodificación de OpenStreetMap (Nominatim), gestionado por la OpenStreetMap Foundation, para mostrar el nombre del lugar. La Fundación es un destinatario independiente con su propia política de privacidad, no un encargado del tratamiento que actúe por cuenta nuestra. Nombres de lugares © OpenStreetMap contributors.",
    retentionTitle: "Cuánto tiempo",
    retention:
      "Las conversaciones cerradas se borran tras el plazo que haya fijado el propietario (90 días por defecto). El propietario puede borrar una conversación en cualquier momento. Las copias de seguridad nocturnas conservan una conversación borrada hasta 30 días más. Los nombres de lugar consultados para posiciones compartidas se guardan en caché como máximo 30 días y se eliminan junto con la conversación.",
    cookiesTitle: "Cookies y seguimiento",
    cookies:
      "No hay analítica ni seguimiento. La única cookie es una estrictamente necesaria que te permite reabrir tu conversación en este dispositivo.",
    deletionTitle: "Borrado y preguntas",
    deletion:
      "Para que borren tus datos, escríbelo en tu conversación y el propietario los eliminará. También puedes escribir al propietario por correo si la tarjeta muestra una dirección.",
  },
  categories: {
    backpack: "Mochila",
    suitcase: "Maleta",
    bag: "Bolso",
    laptop: "Portátil",
    tablet: "Tableta",
    phone: "Móvil",
    camera: "Cámara",
    headphones: "Auriculares",
    wallet: "Cartera",
    keys: "Llaves",
    documents: "Documentos",
    clothing: "Ropa",
    other: "Objeto",
  },
  proposalKinds: {
    meeting_point: "Punto de encuentro",
    public_place: "Lugar público",
    hotel_reception: "Recepción de hotel",
    lost_and_found: "Oficina de objetos perdidos",
    shipping: "Envío",
    other: "Otro",
  },
  proposalStatus: {
    proposed: "Esperando respuesta",
    accepted: "Aceptada",
    declined: "Rechazada",
    cancelled: "Retirada",
    superseded: "Sustituida por un acuerdo más reciente",
  },
};

const dictionaries: Record<Language, Dict> = { en, de, es };

export function dict(lang: Language): Dict {
  return dictionaries[lang];
}

export function fmt(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));
}

export function categoryName(lang: Language, category: string): string {
  const names: Record<string, string> = dictionaries[lang].categories;
  return names[category] ?? dictionaries[lang].categories.other;
}

export function proposalKindName(lang: Language, kind: ProposalKind): string {
  return dictionaries[lang].proposalKinds[kind];
}

export function proposalStatusName(lang: Language, status: ProposalStatus): string {
  return dictionaries[lang].proposalStatus[status];
}

export const LANGUAGE_NAMES: Record<Language, string> = { en: "English", de: "Deutsch", es: "Español" };

/** Built-in return/lost messages used when the owner left the localized text empty. */
export function defaultReturnMessage(lang: Language): string {
  return dictionaries[lang].tag.defaultReturn;
}

export function defaultLostMessage(lang: Language): string {
  return dictionaries[lang].tag.defaultLost;
}
