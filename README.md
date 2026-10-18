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
  - La pantalla no s'apaga durant la partida.
- Renderitzadors WebGL2/WebGPU, millora de nitidesa, estadístiques, ratolí i teclat, mando tàctil, dreceres, captures de pantalla…

## Com compilar

Necessites [Bun](https://bun.sh).

```bash
bun install
bun build.ts --version 1.0.0 --variant full          # genera dist/xcloud-catala.user.js
bun build.ts --version 1.0.0 --variant full --pretty # versió llegible (per depurar)
```

Instal·la el fitxer `dist/xcloud-catala.user.js` amb Tampermonkey o Violentmonkey.

## Aplicació Android (APK)

El directori `android/` conté una app mínima (WebView) que carrega `xbox.com/play` i hi injecta l'script abans que s'executi la pàgina.

**Opció A, sense instal·lar l'SDK:** puja el projecte a un repositori teu de GitHub i executa l'acció *Construeix l'APK* (pestanya Actions). Descarrega l'APK de l'artefacte `xcloud-catala-apk` i instal·la'l al mòbil (cal permetre fonts desconegudes).

**Opció B, en local:** compila primer l'script (`bun build.ts --version 1.0.0 --variant full`), obre la carpeta `android/` amb Android Studio i fes *Build → Build APK(s)*.

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
