# ASUSWRT

## Présentation

Cette intégration amène un **routeur ASUS** dans Gladys : micrologiciel ASUSWRT d’origine ou Asuswrt-Merlin, des modèles RT-AC aux derniers routeurs Wi-Fi 7. Elle lit le routeur par sa propre interface web, sur votre réseau local, toutes les 30 secondes :

- le **routeur** : utilisation CPU et mémoire, températures, temps de fonctionnement, débits Internet, état d’Internet, adresse WAN, clients connectés, micrologiciel ;
- ses **radios Wi-Fi**, sous forme d’interrupteurs ;
- les **appareils de votre réseau**, sous forme de capteurs de présence : sachez qui est à la maison grâce aux téléphones connectés au Wi-Fi.

Elle apporte aussi des déclencheurs de scène (Internet coupé ou rétabli, appareil arrivé ou parti, nouvel appareil sur le réseau, routeur redémarré, mise à jour disponible), des actions de scène (lire l’état, redémarrer un service, vérifier les mises à jour, redémarrer) et trois widgets de tableau de bord.

![Les trois widgets de l’intégration : vue d’ensemble du routeur ASUS, lien Internet et appareils du réseau (illustration générée, pas une capture d’écran)](https://raw.githubusercontent.com/William-De71/gladys-asuswrt/main/docs/assets/widgets.fr.png)

L’image ci-dessus est une illustration générée, pas une capture d’écran.

## Prérequis

- Gladys Assistant 5.3.0 ou plus récent.
- Un routeur ASUS en mode routeur, avec l’interface web ASUSWRT (micrologiciel d’origine 3.0.0.4.386 ou plus récent, 3.0.0.6, ou Asuswrt-Merlin). L’intégration dialogue avec le routeur principal : les nœuds AiMesh sont exclus de la liste des clients, le routeur principal connaît tous les clients.
- Le compte administrateur du routeur (celui de son interface web). L’intégration se connecte comme l’application ASUS Router : elle ne vous déconnecte pas de l’interface web.
- Gladys doit atteindre le routeur : son adresse sur le réseau local (`192.168.50.1`, `192.168.1.1`, `router.asus.com`). Si vous avez activé le HTTPS pour l’accès local (**Administration > Système > Configuration de l’accès local**), saisissez `https://` et son port (8443 par défaut).

## Configuration

| Champ                        | Description                                                                                                            |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Adresse du routeur           | `192.168.50.1` (http:// est ajouté), ou `https://192.168.50.1:8443` avec le HTTPS.                                     |
| Nom d’utilisateur            | Le compte administrateur du routeur.                                                                                   |
| Mot de passe                 | Son mot de passe. Après quelques essais erronés, le routeur bloque la connexion quelques minutes.                      |
| Vérifier le certificat       | HTTPS seulement. Laissez décoché avec le certificat auto-signé du routeur.                                             |
| Intervalle de lecture (s)    | De 10 à 300 secondes, 30 par défaut.                                                                                   |
| Appareils du réseau proposés | Ceux qui ont un nom (par défaut), tous, ou aucun.                                                                      |
| Délai d’absence (min)        | Un appareil est absent après ce délai sans connexion. 5 par défaut : un téléphone en veille quitte le Wi-Fi un moment. |
| Langue des textes            | Noms, états et résumés des scènes. Automatique : la langue de votre tableau de bord, dès qu’un widget a été affiché.   |

Cliquez sur **Tester la connexion** : le modèle et le micrologiciel du routeur s’affichent. **Oublier les appareils connus** fait des appareils présents la référence du déclencheur « nouvel appareil ».

## Utilisation

### Appareils

Ouvrez **Découvrir** dans l’intégration et ajoutez les appareils voulus :

| Appareil        | Fonctionnalités                                                                                                                                                                                      |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Routeur ASUS    | Utilisation CPU et mémoire (%), températures (CPU et chaque radio indiquée par le routeur), temps de fonctionnement, débits descendant et montant (Mbit/s), Internet, IP WAN, clients, micrologiciel |
| Radio Wi-Fi     | Un interrupteur : allume ou coupe la radio d’une bande                                                                                                                                               |
| Appareil réseau | Présence : 1 tant qu’il est connecté, 0 une fois parti depuis le délai d’absence                                                                                                                     |

Les débits sont ceux du lien Internet, mesurés entre deux lectures : ils apparaissent dès la deuxième lecture.

### Présence des appareils

Un appareil est présent dès que le routeur l’indique en ligne, et absent une fois parti depuis le délai d’absence. Tant qu’il est présent, sa présence est renvoyée chaque minute, comme la présence Bluetooth de Gladys : l’action « vérifier la présence » d’une scène fonctionne avec. Donnez un nom aux téléphones dans le routeur (**Carte du réseau > Clients**) pour les retrouver facilement : par défaut, seuls les appareils qui ont un nom sont proposés.

### Radios Wi-Fi

Couper ou allumer une radio fait redémarrer le Wi-Fi du routeur : toutes les bandes sont coupées quelques secondes, puis les appareils se reconnectent. Une radio coupée depuis l’interface du routeur apparaît dans Gladys à la lecture suivante.

### Widgets du tableau de bord

- **Routeur ASUS** : jauges CPU et mémoire, température, clients connectés, Internet, temps de fonctionnement, micrologiciel, et deux boutons : **Chercher une mise à jour** et **Redémarrer** (avec confirmation).
- **Lien Internet** : débits descendant et montant, leur historique (une fois l’appareil routeur ajouté), état, adresse WAN et passerelle. Réglage : période du graphique.
- **Appareils du réseau** : les appareils connectés en ce moment, ceux partis, ou tous, avec leur connexion (filaire, bande Wi-Fi). Réglage : quoi afficher.

### Scènes

Déclencheurs :

- **Internet coupé ou rétabli** : filtre sur l’état. Variables : état, IP WAN, résumé.
- **Appareil arrivé ou parti** : un appareil ajouté dans Gladys, ou n’importe lequel. Variables : nom, événement, MAC, IP, connexion, résumé.
- **Nouvel appareil sur le réseau** : une adresse MAC jamais vue, une seule fois (mémorisée entre les redémarrages). Filtre : Wi-Fi ou filaire.
- **Routeur redémarré** : coupure de courant, plantage, mise à jour. Un redémarrage demandé depuis Gladys ne le déclenche pas.
- **Mise à jour disponible** : le routeur vérifie lui-même une fois par jour.

Actions :

- **Lire l’état** : CPU, mémoire, température, temps de fonctionnement, débits, Internet, IP WAN, appareils présents, micrologiciel, mise à jour disponible, et un résumé pour un message.
- **Redémarrer un service** : Wi-Fi (toutes les bandes), connexion Internet (une nouvelle adresse chez la plupart des fournisseurs), serveur DNS et DHCP.
- **Vérifier les mises à jour** : demande au routeur d’interroger tout de suite le serveur d’ASUS (jusqu’à une minute).
- **Redémarrer le routeur** : le réseau et Internet sont coupés quelques minutes.

Exemples : quand Internet est coupé, éteindre puis rallumer la prise connectée de la box ; quand le téléphone d’un enfant arrive, allumer la lumière de l’entrée ; chaque nuit à 1 h, couper la radio 5 GHz, et la rallumer à 7 h.

### Transport

Local uniquement : l’intégration dialogue avec l’interface web du routeur sur votre réseau, rien ne passe par un cloud. Le routeur lui-même contacte le serveur de mises à jour d’ASUS lors d’une vérification.

## Dépannage

- **« Le routeur refuse le nom d’utilisateur ou le mot de passe »** : saisissez-les à nouveau ; l’intégration attend 15 minutes avant de réessayer, pour que le routeur ne bloque pas le compte. Enregistrer la configuration réessaie tout de suite.
- **« Le routeur a bloqué la connexion »** : trop d’essais erronés (depuis Gladys ou un navigateur). Attendez le délai indiqué.
- **« ne répond pas comme un routeur ASUS »** : vérifiez l’adresse et le port ; avec le HTTPS activé, saisissez `https://` et le port de la **Configuration de l’accès local**.
- **« Le certificat HTTPS est refusé »** : décochez « Vérifier le certificat », ou installez un certificat valide pour l’adresse saisie.
- **Aucune température** : certains modèles n’en indiquent pas ; une radio coupée n’a pas de température.
- **Un téléphone apparaît absent alors qu’il est là** : augmentez le délai d’absence ; certains téléphones mettent leur Wi-Fi en veille longtemps.
- **Journaux** : ouvrez les journaux de l’intégration dans Gladys, puis une issue sur [GitHub](https://github.com/William-De71/gladys-asuswrt/issues) avec les versions de Gladys et de l’intégration, le modèle et le micrologiciel du routeur, et les journaux (le mot de passe n’y apparaît jamais).
