# Protocol del relé (PC `relay.mjs` i Android `RelayServer.kt`)

Tots dos relés implementen exactament el mateix protocol, de manera que l'script (`RelayHost`) i la pàgina d'espectador (`viewer.html`) no saben quin dels dos tenen al davant.

## Connexions
| Rol | URL | Requisits |
|---|---|---|
| Amfitrió | `ws://127.0.0.1:<port>/ws?role=host` | Només des del mateix dispositiu (loopback) i amb `Origin: https://www.xbox.com` |
| Espectador | `ws://<ip>:<port>/ws?role=viewer` | L'`Origin` ha de coincidir amb la capçalera `Host` (evita pàgines alienes) i cal el PIN |
| Pàgina | `GET /` | Serveix `viewer.html` (amb CSP restrictiva) |

## Missatges (text JSON)
**Relé → amfitrió:** `hello {pin, urls, maxViewers, viewers[]}`, `viewer-joined {id, name}`, `viewer-left {id}`, `signal {from, data}`.
**Amfitrió → relé:** `signal {to, data}`, `kick {id}`.
**Relé → espectador:** `joined {id, hostOnline}`, `signal {data}`, `host-offline`, `host-online`, `error {reason: pin|locked|full|kicked}`.
**Espectador → relé:** `join {pin, name}`, `signal {data}`.

`data` és un objecte WebRTC: `{type: 'offer'|'answer', sdp}` o un candidat ICE (`toJSON()`).

## Entrada del mando (binari)
Espectador → relé, 26 bytes: `[1][17 botons u8 (0–255)][4 eixos i16 BE (LX LY RX RY)]`.
El relé el reenvia a l'amfitrió amb l'identificador de l'espectador al davant (27 bytes).

## Seguretat
- PIN aleatori de 6 xifres per sessió; comparació en temps constant; bloqueig per IP després de 5 errors (60 s).
- Màxim 3 espectadors; sense activitat durant 30 s es tanca la connexió.
- Els noms mDNS (`xxxx.local`) dels candidats ICE es substitueixen per l'IP real que veu el relé, perquè la connexió funcioni sense resolució mDNS.
- El vídeo **no** passa pel relé: va directament de l'amfitrió a cada espectador (WebRTC).
