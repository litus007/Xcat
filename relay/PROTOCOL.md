# Protocol del relé (PC `relay.mjs` i Android `RelayServer.kt`)

Tots dos relés implementen exactament el mateix protocol, de manera que l'script (`RelayHost`) i la pàgina d'espectador (`viewer.html`) no saben quin dels dos tenen al davant.

## Connexions
| Rol | URL | Requisits |
|---|---|---|
| Amfitrió | `ws://127.0.0.1:<port>/ws?role=host` | Només des del mateix dispositiu (loopback) i amb `Origin: https://www.xbox.com` |
| Espectador | `ws://<ip>:<port>/ws?role=viewer` | L'`Origin` ha de coincidir amb la capçalera `Host` (o ser `https://appassets.androidplatform.net`, la pàgina inclosa a l'app) |
| Pàgina | `GET /` | Serveix `viewer.html` (amb CSP restrictiva) |
| Detecció | UDP `8788`: paquet `XCC-DISCOVER` | Resposta JSON `{app:"xcloud-catala", v:1, name, port, hostOnline}` |

## Entrar com a espectador (dues maneres)
1. **Amb PIN:** `join {pin, name, deviceId}`. PIN aleatori de 6 xifres, comparació en temps constant, bloqueig per IP després de 5 errors (60 s).
2. **Amb aprovació (sense PIN):** `join {name, deviceId}`. El relé respon `waiting` i envia a l'amfitrió `join-request {rid, name, deviceId, ip}`.
   L'amfitrió contesta `approve {rid}` o `deny {rid}`; si no contesta en 30 s, l'espectador rep `error: timeout`.
   L'amfitrió recorda els `deviceId` marcats com a «Permet sempre» i els aprova sense preguntar.
   Límits: 2 sol·licituds pendents per IP i 5 en total.

## Missatges (text JSON)
**Relé → amfitrió:** `hello {name, pin, urls, maxViewers, viewers[{id,name,vsid}]}`, `viewer-joined {id, name, vsid}`, `viewer-left {id}`, `signal {from, data}`, `join-request`.
**Amfitrió → relé:** `signal {to, data}`, `approve`, `deny`, `kick {id}`, `ping` (batec).
**Relé → espectador:** `waiting`, `joined {id, hostOnline}`, `signal {data}`, `host-offline`, `host-online`, `error {reason: pin|locked|full|kicked|denied|timeout|no-host|busy|replaced}`.
**Espectador → relé:** `join`, `signal {data}`.

`vsid` és un identificador únic de cada unió: permet a l'amfitrió distingir un espectador que torna a entrar d'un que ja tenia connexió, i no duplicar la connexió WebRTC quan el relé es reconnecta.
`data` és un objecte WebRTC: `{type: 'offer'|'answer', sid, sdp}` o un candidat ICE (`toJSON()`).

## Entrada del mando (binari)
Espectador → relé, 26 bytes: `[1][17 botons u8 (0–255)][4 eixos i16 BE (LX LY RX RY)]`.
El relé el reenvia a l'amfitrió amb l'identificador de l'espectador al davant (27 bytes).

## Un dispositiu = una sessió
Si un `deviceId` torna a entrar mentre el relé encara té viva una sessió anterior (Wi-Fi caigut, pestanya congelada), la sessió antiga se substitueix: l'espectador antic rep `error: replaced`, l'amfitrió rep `viewer-left` i després `viewer-joined` amb un `vsid` nou, i l'identificador es reutilitza. Així no queden jugadors ni mandos repetits.

## Ranures dels mandos (mode «un jugador per espectador»)
La ranura 0 (jugador 1 de la consola) és sempre de l'amfitrió. Els espectadors ocupen les ranures 1, 2 i 3.

## Connexió viva
El relé envia un ping WebSocket cada 5 s a tothom i tanca els espectadors que no responen en 15 s (l'amfitrió, en 30 s). Els navegadors responen sols amb un pong, així que l'amfitrió no es desconnecta encara que no enviï res. L'amfitrió, a més, envia un missatge `ping` cada 10 s.

## Seguretat
- Màxim 3 espectadors; fotogrames màxims de 64 KB.
- Els noms mDNS (`xxxx.local`) dels candidats ICE es substitueixen per l'IP real que veu el relé, perquè la connexió funcioni sense resolució mDNS.
- El vídeo **no** passa pel relé: va directament de l'amfitrió a cada espectador (WebRTC).
