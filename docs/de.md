# ASUSWRT

## Überblick

Diese Integration bringt einen **ASUS-Router** in Gladys: Original-Firmware ASUSWRT oder Asuswrt-Merlin, von den RT-AC-Modellen bis zu den neuesten Wi-Fi-7-Routern. Sie liest den Router über seine eigene Weboberfläche in Ihrem lokalen Netzwerk, alle 30 Sekunden:

- den **Router**: CPU- und Speicherauslastung, Temperaturen, Betriebszeit, Internetraten, Internetstatus, WAN-Adresse, verbundene Clients, Firmware;
- seine **WLAN-Funkmodule** als Schalter;
- die **Geräte Ihres Netzwerks** als Anwesenheitssensoren: Wissen Sie anhand der mit dem WLAN verbundenen Telefone, wer zu Hause ist.

Dazu kommen Szenen-Auslöser (Internet weg oder zurück, Gerät gekommen oder gegangen, neues Gerät im Netzwerk, Router neu gestartet, Firmware-Update verfügbar), Szenen-Aktionen (Status lesen, Dienst neu starten, nach Firmware-Update suchen, neu starten) und drei Dashboard-Widgets.

![Die drei Widgets der Integration: Übersicht des ASUS-Routers, Internetverbindung und Netzwerkgeräte (generierte Illustration, kein Screenshot)](https://raw.githubusercontent.com/William-De71/gladys-asuswrt/main/docs/assets/widgets.de.png)

Das Bild oben ist eine generierte Illustration, kein Screenshot.

## Voraussetzungen

- Gladys Assistant 5.1.0 oder neuer.
- Ein ASUS-Router im Router-Modus mit der ASUSWRT-Weboberfläche (Original-Firmware 3.0.0.4.386 oder neuer, 3.0.0.6, oder Asuswrt-Merlin). Die Integration spricht mit dem Hauptrouter: AiMesh-Knoten werden aus der Client-Liste ausgeschlossen, der Hauptrouter kennt alle Clients.
- Das Administratorkonto des Routers (das seiner Weboberfläche). Die Integration meldet sich wie die App ASUS Router an: Sie werden nicht von der Weboberfläche abgemeldet.
- Gladys muss den Router erreichen: seine LAN-Adresse (`192.168.50.1`, `192.168.1.1`, `router.asus.com`). Wenn Sie HTTPS für den lokalen Zugriff aktiviert haben (**Administration > System > Lokale Zugriffskonfiguration**), geben Sie `https://` und den Port ein (standardmäßig 8443).

## Konfiguration

| Feld                           | Beschreibung                                                                                                                         |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Adresse des Routers            | `192.168.50.1` (http:// wird ergänzt) oder `https://192.168.50.1:8443` mit HTTPS.                                                    |
| Benutzername                   | Das Administratorkonto des Routers.                                                                                                  |
| Passwort                       | Sein Passwort. Nach einigen Fehlversuchen sperrt der Router die Anmeldung einige Minuten.                                            |
| Zertifikat prüfen              | Nur HTTPS. Mit dem selbstsignierten Zertifikat des Routers nicht ankreuzen.                                                          |
| Leseintervall (s)              | 10 bis 300 Sekunden, standardmäßig 30.                                                                                               |
| Angebotene Netzwerkgeräte      | Die mit einem Namen (Standard), alle oder keine.                                                                                     |
| Abwesenheitsverzögerung (Min.) | Ein Gerät gilt nach dieser Zeit ohne Verbindung als abwesend. Standardmäßig 5: Ein schlafendes Telefon verlässt das WLAN eine Weile. |
| Sprache der Texte              | Namen, Zustände und Szenen-Zusammenfassungen. Automatisch: die Sprache Ihres Dashboards, sobald ein Widget angezeigt wurde.          |

Klicken Sie auf **Verbindung testen**: Modell und Firmware des Routers werden angezeigt. **Bekannte Geräte vergessen** macht die jetzt vorhandenen Geräte zur Referenz des Auslösers „neues Gerät“.

## Verwendung

### Geräte

Öffnen Sie **Erkennen** in der Integration und fügen Sie die gewünschten Geräte hinzu:

| Gerät          | Funktionen                                                                                                                                                                    |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ASUS-Router    | CPU- und Speicherauslastung (%), Temperaturen (CPU und jedes vom Router gemeldete Funkmodul), Betriebszeit, Download und Upload (Mbit/s), Internet, WAN-IP, Clients, Firmware |
| WLAN-Funkmodul | Ein Schalter: schaltet den Funk eines Bandes ein oder aus                                                                                                                     |
| Netzwerkgerät  | Anwesenheit: 1 solange es verbunden ist, 0 nachdem es die Abwesenheitsverzögerung lang weg war                                                                                |

Die Raten sind die der Internetverbindung, gemessen zwischen zwei Lesungen: Sie erscheinen ab der zweiten Lesung.

### Anwesenheit der Geräte

Ein Gerät ist anwesend, sobald der Router es als online meldet, und abwesend, nachdem es die Abwesenheitsverzögerung lang weg war. Solange es anwesend ist, wird seine Anwesenheit jede Minute erneut gesendet, wie die Bluetooth-Anwesenheit von Gladys: Die Aktion „Anwesenheit prüfen“ einer Szene funktioniert damit. Geben Sie den Telefonen im Router einen Namen (**Netzwerkübersicht > Clients**), um sie leicht zu finden: Standardmäßig werden nur Geräte mit Namen angeboten.

### WLAN-Funkmodule

Das Aus- oder Einschalten eines Funkmoduls lässt den Router sein WLAN neu starten: Alle Bänder fallen einige Sekunden aus, dann verbinden sich die Geräte wieder. Ein in der Router-Oberfläche ausgeschaltetes Funkmodul erscheint in Gladys bei der nächsten Lesung.

### Dashboard-Widgets

- **ASUS-Router**: CPU- und Speicheranzeige, Temperatur, verbundene Clients, Internet, Betriebszeit, Firmware und zwei Schaltflächen: **Firmware prüfen** und **Neu starten** (mit Bestätigung).
- **Internetverbindung**: Download- und Upload-Rate, ihr Verlauf (sobald das Router-Gerät hinzugefügt ist), Status, WAN-Adresse und Gateway. Einstellung: Zeitraum des Diagramms.
- **Netzwerkgeräte**: die jetzt verbundenen Geräte, die gegangenen oder alle, mit ihrer Verbindung (Kabel, WLAN-Band). Einstellung: was angezeigt wird.

### Szenen

Auslöser:

- **Internet weg oder zurück**: Filter auf den Status. Variablen: Status, WAN-IP, Zusammenfassung.
- **Gerät gekommen oder gegangen**: ein in Gladys hinzugefügtes Gerät oder jedes. Variablen: Name, Ereignis, MAC, IP, Verbindung, Zusammenfassung.
- **Neues Gerät im Netzwerk**: eine nie gesehene MAC-Adresse, einmal (über Neustarts gespeichert). Filter: WLAN oder Kabel.
- **Router neu gestartet**: Stromausfall, Absturz, Firmware-Update. Ein aus Gladys angeforderter Neustart löst ihn nicht aus.
- **Firmware-Update verfügbar**: Der Router prüft selbst einmal täglich.

Aktionen:

- **Status lesen**: CPU, Speicher, Temperatur, Betriebszeit, Raten, Internet, WAN-IP, anwesende Geräte, Firmware, Update verfügbar und eine Zusammenfassung für eine Nachricht.
- **Dienst neu starten**: WLAN (alle Bänder), Internetverbindung (bei den meisten Anbietern eine neue Adresse), DNS- und DHCP-Server.
- **Nach Firmware-Update suchen**: Lässt den Router jetzt den ASUS-Server prüfen (bis zu einer Minute).
- **Router neu starten**: Netzwerk und Internet sind einige Minuten unterbrochen.

Beispiele: Wenn das Internet ausfällt, die smarte Steckdose der Box aus- und wieder einschalten; wenn das Telefon eines Kindes ankommt, das Licht im Flur einschalten; jede Nacht um 1 Uhr den 5-GHz-Funk ausschalten und um 7 Uhr wieder ein.

### Transport

Nur lokal: Die Integration spricht mit der Weboberfläche des Routers in Ihrem Netzwerk, nichts läuft über eine Cloud. Der Router selbst kontaktiert bei einer Firmware-Prüfung den Update-Server von ASUS.

## Fehlerbehebung

- **„Der Router lehnt Benutzername oder Passwort ab“**: Geben Sie sie erneut ein; die Integration wartet 15 Minuten vor einem neuen Versuch, damit der Router das Konto nicht sperrt. Das Speichern der Konfiguration versucht es sofort.
- **„Der Router hat die Anmeldung gesperrt“**: zu viele Fehlversuche (aus Gladys oder einem Browser). Warten Sie die angezeigte Zeit ab.
- **„antwortet nicht wie ein ASUS-Router“**: Prüfen Sie Adresse und Port; bei aktivem HTTPS `https://` und den Port der **Lokalen Zugriffskonfiguration** eingeben.
- **„Das HTTPS-Zertifikat wird abgelehnt“**: Deaktivieren Sie „Zertifikat prüfen“ oder installieren Sie ein für die eingegebene Adresse gültiges Zertifikat.
- **Keine Temperatur**: Manche Modelle melden keine; ein ausgeschaltetes Funkmodul hat keine Temperatur.
- **Ein Telefon erscheint abwesend, obwohl es da ist**: Erhöhen Sie die Abwesenheitsverzögerung; manche Telefone versetzen ihr WLAN lange in den Ruhezustand.
- **Protokolle**: Öffnen Sie die Protokolle der Integration in Gladys, dann ein Issue auf [GitHub](https://github.com/William-De71/gladys-asuswrt/issues) mit den Versionen von Gladys und der Integration, Modell und Firmware des Routers und den Protokollen (das Passwort erscheint darin nie).
