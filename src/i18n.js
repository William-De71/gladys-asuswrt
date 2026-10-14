// -----------------------------------------------------------------------------
// Texts of the integration, in English, French, German and Spanish (English
// fallback).
//
// The manifest carries its own labels; these are the texts the code writes at
// runtime: device and feature names, states, widget contents, scene
// summaries, messages of the Configuration screen. Vocabulary of the Gladys
// interface: appareil / Gerät / dispositivo, scène / Szene / escena; and of
// the ASUS router interface: micrologiciel / Firmware / firmware.
// -----------------------------------------------------------------------------

const LANGUAGES = ['en', 'fr', 'de', 'es'];

const TEXTS = {
  // devices
  routerDeviceName: {
    en: 'ASUS {model}',
    fr: 'ASUS {model}',
    de: 'ASUS {model}',
    es: 'ASUS {model}',
  },
  radioDeviceName: {
    en: 'Wi-Fi {band}',
    fr: 'Wi-Fi {band}',
    de: 'WLAN {band}',
    es: 'Wi-Fi {band}',
  },
  radioDeviceNameSsid: {
    en: 'Wi-Fi {band} ({ssid})',
    fr: 'Wi-Fi {band} ({ssid})',
    de: 'WLAN {band} ({ssid})',
    es: 'Wi-Fi {band} ({ssid})',
  },
  band_2g: { en: '2.4 GHz', fr: '2,4 GHz', de: '2,4 GHz', es: '2,4 GHz' },
  band_5g: { en: '5 GHz', fr: '5 GHz', de: '5 GHz', es: '5 GHz' },
  band_5g2: { en: '5 GHz-2', fr: '5 GHz-2', de: '5 GHz-2', es: '5 GHz-2' },
  band_6g: { en: '6 GHz', fr: '6 GHz', de: '6 GHz', es: '6 GHz' },
  band_6g2: { en: '6 GHz-2', fr: '6 GHz-2', de: '6 GHz-2', es: '6 GHz-2' },
  featureCpu: { en: 'CPU usage', fr: 'Utilisation CPU', de: 'CPU-Auslastung', es: 'Uso de CPU' },
  featureMemory: {
    en: 'Memory usage',
    fr: 'Utilisation mémoire',
    de: 'Speicherauslastung',
    es: 'Uso de memoria',
  },
  featureTemperature_cpu: {
    en: 'CPU temperature',
    fr: 'Température CPU',
    de: 'CPU-Temperatur',
    es: 'Temperatura de la CPU',
  },
  featureTemperature_2g: {
    en: '2.4 GHz radio temperature',
    fr: 'Température radio 2,4 GHz',
    de: 'Temperatur Funk 2,4 GHz',
    es: 'Temperatura radio 2,4 GHz',
  },
  featureTemperature_5g: {
    en: '5 GHz radio temperature',
    fr: 'Température radio 5 GHz',
    de: 'Temperatur Funk 5 GHz',
    es: 'Temperatura radio 5 GHz',
  },
  featureTemperature_5g2: {
    en: '5 GHz-2 radio temperature',
    fr: 'Température radio 5 GHz-2',
    de: 'Temperatur Funk 5 GHz-2',
    es: 'Temperatura radio 5 GHz-2',
  },
  featureTemperature_6g: {
    en: '6 GHz radio temperature',
    fr: 'Température radio 6 GHz',
    de: 'Temperatur Funk 6 GHz',
    es: 'Temperatura radio 6 GHz',
  },
  featureUptime: {
    en: 'Uptime',
    fr: 'Temps de fonctionnement',
    de: 'Betriebszeit',
    es: 'Tiempo en marcha',
  },
  featureDownload: {
    en: 'Internet download',
    fr: 'Débit Internet descendant',
    de: 'Internet-Download',
    es: 'Descarga de Internet',
  },
  featureUpload: {
    en: 'Internet upload',
    fr: 'Débit Internet montant',
    de: 'Internet-Upload',
    es: 'Subida de Internet',
  },
  featureInternet: { en: 'Internet', fr: 'Internet', de: 'Internet', es: 'Internet' },
  featureWanIp: {
    en: 'WAN IP address',
    fr: 'Adresse IP WAN',
    de: 'WAN-IP-Adresse',
    es: 'Dirección IP WAN',
  },
  featureClients: {
    en: 'Connected clients',
    fr: 'Clients connectés',
    de: 'Verbundene Clients',
    es: 'Clientes conectados',
  },
  featureFirmware: { en: 'Firmware', fr: 'Micrologiciel', de: 'Firmware', es: 'Firmware' },
  featureRadio: { en: 'Radio', fr: 'Radio', de: 'Funk', es: 'Radio' },
  featurePresence: { en: 'Presence', fr: 'Présence', de: 'Anwesenheit', es: 'Presencia' },

  // states
  internet_connected: { en: 'Connected', fr: 'Connecté', de: 'Verbunden', es: 'Conectado' },
  internet_connecting: {
    en: 'Connecting',
    fr: 'Connexion en cours',
    de: 'Verbindung wird aufgebaut',
    es: 'Conectando',
  },
  internet_disconnected: {
    en: 'Disconnected',
    fr: 'Déconnecté',
    de: 'Getrennt',
    es: 'Desconectado',
  },
  internet_unknown: { en: 'Unknown', fr: 'Inconnu', de: 'Unbekannt', es: 'Desconocido' },
  connectionWired: { en: 'Wired', fr: 'Filaire', de: 'Kabel', es: 'Por cable' },
  connectionWifi: {
    en: 'Wi-Fi {band}',
    fr: 'Wi-Fi {band}',
    de: 'WLAN {band}',
    es: 'Wi-Fi {band}',
  },

  // scene summaries
  summaryInternet_connected: {
    en: 'The internet connection is back (IP {ip}).',
    fr: 'La connexion Internet est rétablie (IP {ip}).',
    de: 'Die Internetverbindung ist wieder da (IP {ip}).',
    es: 'La conexión a Internet se ha restablecido (IP {ip}).',
  },
  summaryInternet_disconnected: {
    en: 'The internet connection of the router is down.',
    fr: 'La connexion Internet du routeur est coupée.',
    de: 'Die Internetverbindung des Routers ist unterbrochen.',
    es: 'La conexión a Internet del router está caída.',
  },
  summaryPresence_arrived: {
    en: '{name} is connected to the network.',
    fr: '{name} est connecté au réseau.',
    de: '{name} ist mit dem Netzwerk verbunden.',
    es: '{name} está conectado a la red.',
  },
  summaryPresence_left: {
    en: '{name} left the network.',
    fr: '{name} a quitté le réseau.',
    de: '{name} hat das Netzwerk verlassen.',
    es: '{name} ha salido de la red.',
  },
  summaryNewClient: {
    en: 'New device on the network: {name} ({ip}, {connection}).',
    fr: 'Nouvel appareil sur le réseau : {name} ({ip}, {connection}).',
    de: 'Neues Gerät im Netzwerk: {name} ({ip}, {connection}).',
    es: 'Nuevo dispositivo en la red: {name} ({ip}, {connection}).',
  },
  summaryRebooted: {
    en: 'The router {model} rebooted.',
    fr: 'Le routeur {model} a redémarré.',
    de: 'Der Router {model} wurde neu gestartet.',
    es: 'El router {model} se ha reiniciado.',
  },
  firmwareUnchecked: {
    en: 'The router has not checked for a firmware update yet.',
    fr: 'Le routeur n’a pas encore vérifié les mises à jour du micrologiciel.',
    de: 'Der Router hat noch nicht nach einem Firmware-Update gesucht.',
    es: 'El router aún no ha buscado actualizaciones de firmware.',
  },
  firmwareUpToDate: {
    en: 'The firmware is up to date ({version}).',
    fr: 'Le micrologiciel est à jour ({version}).',
    de: 'Die Firmware ist aktuell ({version}).',
    es: 'El firmware está actualizado ({version}).',
  },
  firmwareAvailable: {
    en: 'A firmware update is available{version}.',
    fr: 'Une mise à jour du micrologiciel est disponible{version}.',
    de: 'Ein Firmware-Update ist verfügbar{version}.',
    es: 'Hay una actualización de firmware disponible{version}.',
  },
  summaryStatus: {
    en: 'Router: CPU {cpu} %, memory {memory} %.',
    fr: 'Routeur : CPU {cpu} %, mémoire {memory} %.',
    de: 'Router: CPU {cpu} %, Speicher {memory} %.',
    es: 'Router: CPU {cpu} %, memoria {memory} %.',
  },
  summaryStatusInternet_connected: {
    en: 'Internet connected ({ip}).',
    fr: 'Internet connecté ({ip}).',
    de: 'Internet verbunden ({ip}).',
    es: 'Internet conectado ({ip}).',
  },
  summaryStatusInternet_connecting: {
    en: 'Internet connecting.',
    fr: 'Connexion Internet en cours.',
    de: 'Internetverbindung wird aufgebaut.',
    es: 'Conectando a Internet.',
  },
  summaryStatusInternet_disconnected: {
    en: 'Internet disconnected.',
    fr: 'Internet déconnecté.',
    de: 'Internet getrennt.',
    es: 'Internet desconectado.',
  },
  summaryStatusInternet_unknown: {
    en: 'Internet status unknown.',
    fr: 'État d’Internet inconnu.',
    de: 'Internetstatus unbekannt.',
    es: 'Estado de Internet desconocido.',
  },
  summaryStatusClients: {
    en: '{count} device(s) on the network.',
    fr: '{count} appareil(s) sur le réseau.',
    de: '{count} Gerät(e) im Netzwerk.',
    es: '{count} dispositivo(s) en la red.',
  },

  // widgets
  overviewCaption: {
    en: '{model} · {ip} · {ago}',
    fr: '{model} · {ip} · {ago}',
    de: '{model} · {ip} · {ago}',
    es: '{model} · {ip} · {ago}',
  },
  uptimeValue: {
    en: '{days} d {hours} h',
    fr: '{days} j {hours} h',
    de: '{days} T. {hours} Std.',
    es: '{days} d {hours} h',
  },
  tileCpu: { en: 'CPU', fr: 'CPU', de: 'CPU', es: 'CPU' },
  tileMemory: { en: 'Memory', fr: 'Mémoire', de: 'Speicher', es: 'Memoria' },
  tileTemperature: { en: 'Temperature', fr: 'Température', de: 'Temperatur', es: 'Temperatura' },
  tileCpuTemperature: { en: 'CPU temp.', fr: 'Temp. CPU', de: 'CPU-Temp.', es: 'Temp. CPU' },
  tileClients: { en: 'Clients', fr: 'Clients', de: 'Clients', es: 'Clientes' },
  rowInternet: { en: 'Internet', fr: 'Internet', de: 'Internet', es: 'Internet' },
  rowUptime: { en: 'Uptime', fr: 'En marche depuis', de: 'Betriebszeit', es: 'En marcha desde' },
  rowFirmware: { en: 'Firmware', fr: 'Micrologiciel', de: 'Firmware', es: 'Firmware' },
  rowWanIp: { en: 'WAN IP', fr: 'IP WAN', de: 'WAN-IP', es: 'IP WAN' },
  rowGateway: {
    en: 'Gateway',
    fr: 'Passerelle',
    de: 'Gateway',
    es: 'Puerta de enlace',
  },
  updateAvailable: {
    en: 'Update {version}',
    fr: 'Mise à jour {version}',
    de: 'Update {version}',
    es: 'Actualización {version}',
  },
  buttonCheckUpdates: {
    en: 'Check firmware',
    fr: 'Chercher une mise à jour',
    de: 'Firmware prüfen',
    es: 'Comprobar firmware',
  },
  buttonReboot: { en: 'Reboot', fr: 'Redémarrer', de: 'Neu starten', es: 'Reiniciar' },
  internetCaption: {
    en: 'Internet · {proto} · WAN {unit}',
    fr: 'Internet · {proto} · WAN {unit}',
    de: 'Internet · {proto} · WAN {unit}',
    es: 'Internet · {proto} · WAN {unit}',
  },
  tileDownload: { en: 'Download', fr: 'Réception', de: 'Download', es: 'Descarga' },
  tileUpload: { en: 'Upload', fr: 'Envoi', de: 'Upload', es: 'Subida' },
  chartTraffic: {
    en: 'Internet traffic',
    fr: 'Trafic Internet',
    de: 'Internetverkehr',
    es: 'Tráfico de Internet',
  },
  noWan: {
    en: 'The router reports no internet link yet.',
    fr: 'Le routeur n’indique encore aucun lien Internet.',
    de: 'Der Router meldet noch keine Internetverbindung.',
    es: 'El router todavía no indica ningún enlace a Internet.',
  },
  networkCaption: {
    en: '{present} connected of {total} known',
    fr: '{present} connecté(s) sur {total} connu(s)',
    de: '{present} verbunden von {total} bekannten',
    es: '{present} conectado(s) de {total} conocido(s)',
  },
  networkMore: {
    en: '{count} more',
    fr: '{count} de plus',
    de: '{count} weitere',
    es: '{count} más',
  },
  networkEmpty_present: {
    en: 'No device is connected to the router right now.',
    fr: 'Aucun appareil n’est connecté au routeur en ce moment.',
    de: 'Derzeit ist kein Gerät mit dem Router verbunden.',
    es: 'Ningún dispositivo está conectado al router en este momento.',
  },
  networkEmpty_absent: {
    en: 'No device left the network since the integration started.',
    fr: 'Aucun appareil n’a quitté le réseau depuis le démarrage de l’intégration.',
    de: 'Seit dem Start der Integration hat kein Gerät das Netzwerk verlassen.',
    es: 'Ningún dispositivo ha salido de la red desde que se inició la integración.',
  },
  networkEmpty_all: {
    en: 'The router knows no device on the network yet.',
    fr: 'Le routeur ne connaît encore aucun appareil sur le réseau.',
    de: 'Der Router kennt noch kein Gerät im Netzwerk.',
    es: 'El router todavía no conoce ningún dispositivo en la red.',
  },
  badgeHere: { en: 'Here', fr: 'Présent', de: 'Da', es: 'Presente' },
  badgeWired: { en: 'Wired', fr: 'Filaire', de: 'Kabel', es: 'Cable' },
  badgeGone: { en: 'Gone', fr: 'Parti', de: 'Weg', es: 'Ausente' },
  ago_now: { en: 'just now', fr: 'à l’instant', de: 'gerade eben', es: 'ahora mismo' },
  ago_minutes: {
    en: '{n} min ago',
    fr: 'il y a {n} min',
    de: 'vor {n} Min.',
    es: 'hace {n} min',
  },
  ago_hours: { en: '{n} h ago', fr: 'il y a {n} h', de: 'vor {n} Std.', es: 'hace {n} h' },
  ago_days: {
    en: '{n} days ago',
    fr: 'il y a {n} jours',
    de: 'vor {n} Tagen',
    es: 'hace {n} días',
  },

  // connection status, actions, messages
  noCredentials: {
    en: 'Enter the address of the router, the user name and the password in the configuration.',
    fr: 'Saisissez l’adresse du routeur, le nom d’utilisateur et le mot de passe dans la configuration.',
    de: 'Geben Sie die Adresse des Routers, den Benutzernamen und das Passwort in der Konfiguration ein.',
    es: 'Introduzca la dirección del router, el nombre de usuario y la contraseña en la configuración.',
  },
  notReadYet: {
    en: 'The router has not been read yet: come back in a few seconds.',
    fr: 'Le routeur n’a pas encore été lu : revenez dans quelques secondes.',
    de: 'Der Router wurde noch nicht gelesen: Schauen Sie in ein paar Sekunden wieder vorbei.',
    es: 'El router aún no se ha leído: vuelva en unos segundos.',
  },
  statusConnected: {
    en: '{model}: internet {internet}, {clients} device(s) on the network.',
    fr: '{model} : Internet {internet}, {clients} appareil(s) sur le réseau.',
    de: '{model}: Internet {internet}, {clients} Gerät(e) im Netzwerk.',
    es: '{model}: Internet {internet}, {clients} dispositivo(s) en la red.',
  },
  statusAuth: {
    en: 'The router refuses the user name or the password: check them (no new attempt for 15 minutes, to avoid a lockout).',
    fr: 'Le routeur refuse le nom d’utilisateur ou le mot de passe : vérifiez-les (pas de nouvel essai pendant 15 minutes, pour éviter un blocage).',
    de: 'Der Router lehnt Benutzername oder Passwort ab: Prüfen Sie sie (15 Minuten kein neuer Versuch, um eine Sperre zu vermeiden).',
    es: 'El router rechaza el nombre de usuario o la contraseña: compruébelos (sin nuevo intento durante 15 minutos, para evitar un bloqueo).',
  },
  statusLocked: {
    en: 'The router locked the login after failed attempts: new attempt in {minutes} min.',
    fr: 'Le routeur a bloqué la connexion après des échecs : nouvel essai dans {minutes} min.',
    de: 'Der Router hat die Anmeldung nach Fehlversuchen gesperrt: neuer Versuch in {minutes} Min.',
    es: 'El router bloqueó el inicio de sesión tras varios fallos: nuevo intento en {minutes} min.',
  },
  statusTls: {
    en: 'The HTTPS certificate of the router is refused: untick “Verify the certificate” or install a valid one.',
    fr: 'Le certificat HTTPS du routeur est refusé : décochez « Vérifier le certificat » ou installez-en un valide.',
    de: 'Das HTTPS-Zertifikat des Routers wird abgelehnt: Deaktivieren Sie „Zertifikat prüfen“ oder installieren Sie ein gültiges.',
    es: 'El certificado HTTPS del router es rechazado: desmarque «Verificar el certificado» o instale uno válido.',
  },
  statusNotFound: {
    en: 'This address does not answer like an ASUS router: check the address and the port.',
    fr: 'Cette adresse ne répond pas comme un routeur ASUS : vérifiez l’adresse et le port.',
    de: 'Diese Adresse antwortet nicht wie ein ASUS-Router: Prüfen Sie Adresse und Port.',
    es: 'Esta dirección no responde como un router ASUS: compruebe la dirección y el puerto.',
  },
  statusUnreachable: {
    en: 'The router does not answer at {url}: check the address, the port and the network.',
    fr: 'Le routeur ne répond pas à {url} : vérifiez l’adresse, le port et le réseau.',
    de: 'Der Router antwortet nicht unter {url}: Prüfen Sie Adresse, Port und Netzwerk.',
    es: 'El router no responde en {url}: compruebe la dirección, el puerto y la red.',
  },
  statusError: {
    en: 'The router answered something unexpected: see the logs of the integration.',
    fr: 'Le routeur a répondu quelque chose d’inattendu : voir les journaux de l’intégration.',
    de: 'Der Router hat unerwartet geantwortet: siehe Protokolle der Integration.',
    es: 'El router respondió algo inesperado: consulte los registros de la integración.',
  },
  testOk: {
    en: 'Connected to {model} (firmware {firmware}).',
    fr: 'Connecté à {model} (micrologiciel {firmware}).',
    de: 'Verbunden mit {model} (Firmware {firmware}).',
    es: 'Conectado a {model} (firmware {firmware}).',
  },
  forgotten: {
    en: 'Known devices forgotten: the next reading is the new reference, without alert.',
    fr: 'Appareils connus oubliés : la prochaine lecture sert de nouvelle référence, sans alerte.',
    de: 'Bekannte Geräte vergessen: Das nächste Lesen ist die neue Referenz, ohne Alarm.',
    es: 'Dispositivos conocidos olvidados: la próxima lectura es la nueva referencia, sin alerta.',
  },
  rebooting: {
    en: 'The router is rebooting: the network is cut for a few minutes.',
    fr: 'Le routeur redémarre : le réseau est coupé quelques minutes.',
    de: 'Der Router startet neu: Das Netzwerk ist einige Minuten unterbrochen.',
    es: 'El router se está reiniciando: la red se corta unos minutos.',
  },
  unknownAction: {
    en: 'Unknown action.',
    fr: 'Action inconnue.',
    de: 'Unbekannte Aktion.',
    es: 'Acción desconocida.',
  },
};

/**
 * @description Whether a value is one of the languages of the integration.
 * @param {unknown} value - The value.
 * @returns {boolean} True for en, fr, de, es.
 */
function isLanguage(value) {
  return LANGUAGES.includes(value);
}

/**
 * @description A text in a language (English fallback), with its
 * substitutions.
 * @param {string} key - The TEXTS key.
 * @param {string} language - The language.
 * @param {object} [values] - The substitutions.
 * @returns {string} The text.
 * @example
 * t('radioDeviceName', 'de', { band: '5 GHz' }); // -> 'WLAN 5 GHz'
 */
function t(key, language, values = {}) {
  const entry = TEXTS[key];
  if (!entry) {
    return key;
  }
  const template = entry[language] ?? entry.en;
  return template.replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ''));
}

/**
 * @description The text in every language, for a multi-language message.
 * @param {string} key - The TEXTS key.
 * @param {object} [values] - The substitutions.
 * @returns {{ en: string, fr: string, de: string, es: string }} The message.
 * @example
 * all('testOk', { model: 'RT-AX88U', firmware: '3.0.0.4.388_24198' });
 */
function all(key, values = {}) {
  return Object.fromEntries(LANGUAGES.map((language) => [language, t(key, language, values)]));
}

/**
 * @description A number written the way a language does, with at most
 * `digits` decimals ("7,2" in French).
 * @param {number|null} value - The number.
 * @param {string} language - The language.
 * @param {number} digits - The decimals.
 * @returns {string} The text, "?" when unknown.
 * @example
 * formatNumber(7.25, 'fr', 1); // -> '7,3'
 */
function formatNumber(value, language, digits) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '?';
  }
  return new Intl.NumberFormat(isLanguage(language) ? language : 'en', {
    maximumFractionDigits: digits,
  }).format(value);
}

/**
 * @description "12 min ago" for an instant.
 * @param {number} instant - The instant, in ms.
 * @param {number} now - Now, in ms.
 * @param {string} language - The language.
 * @returns {string} The relative time.
 * @example
 * ago(Date.now() - 600000, Date.now(), 'en'); // -> '10 min ago'
 */
function ago(instant, now, language) {
  const minutes = Math.max(0, Math.floor((now - instant) / 60000));
  if (minutes < 1) {
    return t('ago_now', language);
  }
  if (minutes < 60) {
    return t('ago_minutes', language, { n: minutes });
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 48) {
    return t('ago_hours', language, { n: hours });
  }
  return t('ago_days', language, { n: Math.floor(hours / 24) });
}

export { LANGUAGES, TEXTS, isLanguage, t, all, formatNumber, ago };
