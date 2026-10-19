# xCloud Català

Millora l'experiència d'**Xbox Cloud Gaming (xCloud)** a [xbox.com/play](https://www.xbox.com/play), totalment en català i amb un **adaptador de mandos** per jugar amb qualsevol mando (PlayStation, Nintendo, genèrics Bluetooth/USB…), no només amb un d'Xbox.

> Aquest projecte és un derivat (fork) d'un projecte de codi obert amb llicència MIT. Consulta [`LICENSE`](LICENSE).
> No està afiliat a Xbox ni a Microsoft. Totes les marques pertanyen als seus propietaris.

## Què inclou

- Interfície 100 % en català. No es descarrega cap traducció d'internet.
- **Cap connexió a servidors de tercers**: sense comprovació d'actualitzacions, sense llistes remotes, sense fonts externes.
- **Adaptador de mandos** (mando virtual Xbox): tradueix qualsevol mando a un mando Xbox estàndard.
  - Perfils automàtics per a DualShock 4, DualSense, Switch Pro Controller, Joy-Con, 8BitDo i mandos genèrics.
  - Assistent d'assignació manual: prem cada botó i es desa el perfil per a aquell mando.
  - Disposició Nintendo (A↔B, X↔Y) i zona morta de palanques configurables.
- **Mando digital en pantalla**: mando Xbox virtual tàctil (palanques, botons, gallets, creueta). Es fusiona amb el mando físic o el substitueix. Doble toc a una palanca = L3/R3.
- **Millores del joc remot i de la xarxa** (Configuració → Transmissió → Xarxa i connexió):
  - **Indicador de connexió**: mostra si la partida va per la xarxa local, per internet o per un relay, amb el ping.
  - **Reconnexió automàtica**: si la sessió cau o s'encalla, reintenta fins a 3 cops (3, 6 i 12 s) amb botó per cancel·lar.
  - **Perfils per tipus de xarxa**: resolució i taxa de bits diferents amb Wi-Fi/cable o amb dades mòbils. No modifica la teva configuració guardada.
  - **Mode de baixa latència**: buffer de vídeo mínim.
  - **Perfil de xarxa per joc**: a la configuració, durant una partida, pots assignar un perfil (Wi-Fi, mòbil, cap) només a aquell joc.
  - La pantalla no s'apaga durant la partida.
- **Repetidor a la xarxa local**: reenvia la partida a altres dispositius (navegador) amb els seus mandos, des del PC (`relay/`) o des de l'APK.
- **Còpia de seguretat** de la configuració, els perfils de mando i els presets (exporta/importa un fitxer JSON).
- **Prova de freqüència del mando**: mesura quants informes per segon arriben del mando (Bluetooth, cable, adaptador).
- Renderitzadors WebGL2/WebGPU, millora de nitidesa, estadístiques, ratolí i teclat, mando tàctil, dreceres, captures de pantalla…

## Com compilar

Necessites [Bun](https://bun.sh).

```bash
bun install
bun build.ts --version 1.0.0 --variant full          # genera dist/xcloud-catala.user.js
bun build.ts --version 1.0.0 --variant full --pretty # versió llegible (per depurar)
```

Instal·la el fitxer `dist/xcloud-catala.user.js` amb Tampermonkey o Violentmonkey.

## Guia ràpida: executar-ho des del PC (Windows)

L'script és un *userscript*: no és un programa que s'obre sol, sinó codi que una extensió del navegador (Tampermonkey o Violentmonkey) injecta dins de la pàgina `xbox.com/play`.

1. **Instal·la Bun** (només cal per compilar). A PowerShell: `powershell -c "irm bun.sh/install.ps1 | iex"` i tanca i torna a obrir la terminal.
2. **Compila l'script.** Des de la carpeta del projecte (p. ex. `D:\git\xcloud-catala`):
   ```powershell
   bun install
   bun build.ts --version 1.0.0 --variant full
   ```
   Això crea `dist\xcloud-catala.user.js`. Si la primera vegada falla amb «Could not resolve ./patches/...», torna-ho a executar (ja està corregit, però és el primer indici si es fa servir una còpia antiga).
3. **Instal·la Tampermonkey** al navegador (Chrome, Edge o Firefox).
   - A Chrome/Edge recents, a `chrome://extensions` → Tampermonkey → *Detalls*, activa **«Permet scripts d'usuari»** (o el mode de desenvolupador) si l'script no s'executa.
4. **Afegeix l'script:** Tampermonkey → *Crea un script nou*, esborra el contingut, enganxa-hi tot el fitxer `dist\xcloud-catala.user.js` i desa (Ctrl+S). També pots arrossegar el fitxer a la finestra del navegador i acceptar la instal·lació.
5. **Obre** [xbox.com/play](https://www.xbox.com/play) i inicia sessió. L'script afegeix el seu botó de configuració a la capçalera i la pàgina queda en català.
6. **Cada vegada que canviïs el codi**, torna a compilar i enganxa el nou fitxer (o activa a Tampermonkey l'actualització des de fitxer local).
7. **Mandos:** connecta el mando al PC (USB o Bluetooth), prem un botó i activa l'adaptador a Configuració → Mando → *Adaptador de mandos*.

> Des del PC no es poden fer servir les funcions que necessiten l'app d'Android (ratolí natiu a mòbil, desar captures a la galeria…); a l'escriptori el ratolí i teclat ja funcionen amb l'API del navegador.

## Aplicació Android (APK)

El directori `android/` conté una app mínima (WebView) que carrega `xbox.com/play` i hi injecta l'script abans que s'executi la pàgina.

L'app implementa el pont `AppInterface`: ratolí i teclat natius (amb un servidor local només accessible des de l'app), captures a *Imatges/xCloud Català*, còpies a *Descàrregues*, vibració del dispositiu i dreceres a la pantalla d'inici.

**Opció A, sense instal·lar l'SDK:** puja el projecte a un repositori teu de GitHub i executa l'acció *Construeix l'APK* (pestanya Actions). Descarrega l'APK de l'artefacte `xcloud-catala-apk` i instal·la'l al mòbil (cal permetre fonts desconegudes).

**Opció B, en local:** compila primer l'script (`bun build.ts --version 1.0.0 --variant full`), obre la carpeta `android/` amb Android Studio i fes *Build → Build APK(s)*.

## Repetidor: veure la partida en més dispositius

Un dispositiu (l'**amfitrió**) rep la partida de la consola o del núvol i la reenvia, per la xarxa local, a altres dispositius (**espectadors**) que només necessiten un navegador. Cada espectador pot jugar amb el seu mando, amb el mando tàctil o amb el teclat.

> Fes-ho servir amb la teva pròpia consola i amb persones de casa. Reenviar una sessió de Game Pass Cloud a altres persones pot incomplir les condicions de Microsoft.

### Amfitrió al PC
1. Obre una terminal a la carpeta del projecte i executa `bun relay/relay.mjs` (o `bun run relay`). Mostra un **PIN** i l'adreça per als espectadors. Si Windows pregunta pel tallafoc, permet-ho a *Xarxes privades*.
2. A xbox.com/play, a Configuració → Transmissió → **Repetidor**, activa *Comparteix la partida amb altres dispositius*.
3. Inicia la partida: durant uns segons es veu el PIN i l'adreça a baix a l'esquerra.
4. Als altres dispositius, obre l'adreça (p. ex. `http://192.168.1.20:8787`), escriu el PIN i prem *Connecta*.

### Amfitrió a Android (APK)
No cal cap programa: el relé va dins de l'app. Activa el repetidor a la configuració, inicia la partida i usa l'adreça i el PIN que apareixen.

### Mandos dels espectadors
- **Comparteixen el jugador 1** (per defecte): els mandos dels espectadors se sumen al del jugador 1.
- **Un jugador per espectador**: cada espectador és un mando independent (jugadors 2, 3 i 4). Cal activar el *cooperatiu local* i que el joc l'admeti.
- Els navegadors només exposen l'API de mandos en pàgines segures (HTTPS). Com que l'adreça local és HTTP, a l'espectador els **mandos físics** poden no funcionar. A Chrome/Edge es solucionen obrint `chrome://flags/#unsafely-treat-insecure-origin-as-secure`, afegint-hi l'adreça (`http://192.168.1.20:8787`), activant el flag i reiniciant el navegador. El mando tàctil i el teclat funcionen sempre.

### Limitacions
- L'amfitrió ha de tornar a codificar el vídeo per cada espectador: gasta CPU i bateria i afegeix una mica de latència. Al PC va bé; al mòbil, millor amb un o dos espectadors.
- Només xarxa local (sense STUN/TURN). Algunes xarxes Wi-Fi amb «aïllament de clients» ho bloquegen.
- Si la pàgina d'xbox.com bloqueja la connexió a `ws://127.0.0.1` (CSP del navegador), la consola del navegador ho mostrarà. A l'APK no passa.
- Protocol i mesures de seguretat: [`relay/PROTOCOL.md`](relay/PROTOCOL.md). Proves automàtiques: `npm run test:relay`.

## Com utilitzar l'adaptador de mandos

1. Connecta el mando al dispositiu i prem-hi qualsevol botó.
2. Obre **Configuració → Mando → Adaptador de mandos** i activa'l.
3. Si els botons no coincideixen, prem **Assigna els botons del mando** i segueix l'assistent.

## Personalitzacions locals

- Disposicions tàctils pròpies: clau `BetterXcloud.CustomTouchLayouts` del `localStorage` (`{ "<titleId>": { "default_layout": "...", "layouts": { ... } } }`).
- Icones dels botons (PromptFont): si tens la font instal·lada al sistema, es fa servir automàticament.

## Crèdits i llicència

Llicència MIT. Es conserven els avisos de copyright originals tal com exigeix la llicència.
Inspirat en el mode de ratolí de l'emulador Yuzu, icones de [Phosphor Icons](https://phosphoricons.com) i [PromptFont](https://shinmera.com/promptfont).
