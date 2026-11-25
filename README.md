# 🎮 Gaming Coins

Barna gjør oppgaver, tjener coins og kjøper spilletid. Mamma eller pappa godkjenner,
og Asus-ruteren åpner og stenger internett på PlayStation, iPad og andre enheter automatisk.

## Slik virker det

1. **Barnet trykker på kortet sitt** på veggskjermen og tar en oppgave. Da starter en nedtelling (fristen).
2. Når oppgaven er gjort, trykker barnet **Ferdig!**. Oppgaven venter da på godkjenning.
3. **En forelder** åpner Foreldre med PIN og godkjenner:
   *Full* (alle coins), *Delvis* (f.eks. 50 % hvis den ble levert for sent) eller *Avvis*.
   Hvis fristen går ut før barnet trykker Ferdig, forsvinner oppgaven fra «I gang».
4. Barnet kjøper spilletid i **butikken**, og tiden legges i «banken».
5. Barnet trykker **Start spilling**. Da åpner ruteren internett på barnets enheter, og tiden telles ned.
   **Pause** sparer resten til senere. Når tiden er brukt opp, eller spilletiden i tidsplanen er over,
   stenges internett igjen.

Foreldrene styrer dette i appen:
* Tidsplanen for hver ukedag, f.eks. man–tor 16–20 og lør 09–21.
* Overstyring: *Automatisk*, *Alt åpent* eller *Alt stengt*.
* Oppgaver: coins, frist, hvor ofte de kan gjøres (daglig, ukentlig, ubegrenset) og hvilket barn de gjelder for.
* Prisene i butikken, barn og avatarer, og hvilke enheter hvert barn har (MAC-adresser).
* Bonus- og trekk-knapper, historikk og PIN.

## Mer i appen

* **Nettbutikk med bilder.** Under Foreldre → Butikk legger du til bilde og beskrivelse på hver vare.
  Bildet beskjæres automatisk og lagres i `data/img/` på serveren. Barna kan trykke på en vare for å se den større.
* **Oppdragsbibliotek.** Foreldre → Oppgaver har 50 ferdige oppdrag for 3–14 år, merket med alder og fordelt på Hver dag, Skole og læring, Hjelp hjemme, Ute og aktivitet og Store oppdrag.
  Filtrer på alder, og legg til oppdrag ett og ett eller alle med ett trykk, for alle barn eller ett bestemt barn.
* **App-ikoner for spill.** Spill-fanen ser ut som en mobil hjem-skjerm, med et eget app-ikon for hvert av de 40 spillene. Barnet trykker på et ikon og velger nivå.
  Under Foreldre → Læringsspill kan hjemmeserveren lage egne AI-ikoner (gratis), og du kan gå tilbake til standard-ikonene når du vil.
* **Bilder av oppgaver og varer.** Oppgavene vises som bildekort. Under Foreldre → Oppgaver og Butikk kan du laste opp egne bilder
  eller trykke **«Lag med AI»**. Da lager serveren et bilde fra navnet med den gratis tjenesten Pollinations, uten konto.
  Du kan velge mellom stilene Tegnet, 3D, Akvarell og Leire. «Lag bilder for alle uten bilde» lager ett bilde omtrent hvert 15. sekund i bakgrunnen.
  Med en egen nøkkel fra enter.pollinations.ai (valgfritt) går det raskere. Bildene lagres i `data/img/`, så de virker også uten internett etterpå.
* **Læringsspill (40 spill)**, sortert i Matte, Norsk, Engelsk og Kunnskap:
  * **Matte:** Telle, Hva kommer nå?, Størst eller minst, Tiervenner, Partall eller oddetall, Dobbel og halv, Tallrekker, Matte-sprint, Klokka,
    Gangetabellen, Penger tilbake, Tid, Former, Måleenheter, Avrunding, Romertall, Brøk, Finn x, Minus-tall og Prosent
  * **Norsk:** Første bokstav, Alfabetet, Les ordet, Hva rimer?, Det motsatte, Hvilken bokstav mangler?, Én og mange, Alfabetisk rekkefølge,
    Ordklasser og Dager og måneder
  * **Engelsk:** Engelsk, Engelsk → norsk, og Farger og tall på engelsk
  * **Kunnskap:** Dyreunger, Farger, Trafikk, Dyr og kropp, Verdensrommet, Hovedsteder og Flagg

  Riktige svar gir coins. Under Foreldre → **Læringsspill** setter du coins per riktig svar, bonus og maks per dag.
  Der velger du også **hvilket barn som får spille hvilket spill og nivå**. Knappen «Tilpass» stiller inn spillene etter barnets alder.
  Serveren sjekker tilgangen, så barna kan ikke komme rundt den.
* **Internett per enhet.** Foreldre → **Internett** viser alle enheter: om de har internett nå, hvorfor, og om de er på nett.
  Hver enhet kan stå på Coins (spilletid), Fast åpningstid, Alltid åpen eller Alltid stengt, og har en «Blokker»-knapp.
  Hver enhet kan også få sin egen overordnede åpningstid. Enheter kan samles i **grupper**, for eksempel «Spillkonsoller», med felles modus og åpningstid.
  Barnet ser status for sine egne enheter i Butikk-fanen.
* **Statistikk.** Foreldre → **Statistikk** viser tid på internett per dag og barn, de mest brukte enhetene,
  når på døgnet det brukes mest og spilletid brukt. Serveren registrerer dette hvert minutt og sjekker hvem som er på nett hvert 2. minutt.
* **Lån mellom barna.** Et barn spør et annet om å låne coins, og det andre barnet svarer ja eller nei.
  Om ønskelig må en forelder også godkjenne. Lånet betales tilbake fra Lommebok. Foreldre ser alle lån under Godkjenn og kan slette restgjeld.
* **E-postvarsel.** Foreldre får e-post når noe venter på godkjenning, med flere hendelser samlet i én e-post.
  Sett opp SMTP under Foreldre → Mer. For Gmail: `smtp.gmail.com`, port 587 og et app-passord.
* **Lyd.** Knapper og handlinger har lydeffekter. Lyden slås av og på med høyttaler-knappen på startskjermen.

## Installasjon på aaPanel

Se **INSTALLER.md**: last opp, pakk ut og kjør `bash install.sh`. Det er alt.

## Installasjon uten aaPanel (ca. 10 min)

Du trenger en maskin som alltid står på i huset, for eksempel en Raspberry Pi, en gammel PC/Mac eller en NAS med Node.

1. Installer **Node.js 18 eller nyere** (https://nodejs.org).
2. Pakk ut mappen og kjør:
   ```
   cd gaming-coins
   node server.js
   ```
3. Serveren skriver ut en adresse, f.eks. `http://192.168.50.10:8080`. Åpne den på iPaden eller veggskjermen.
4. iPad: trykk Del → **Legg til på Hjem-skjerm**. Da åpnes appen i fullskjerm.
   Slå på **Veiledet tilgang** (Innstillinger → Tilgjengelighet) hvis barna ikke skal kunne gå ut av appen.
5. Standard foreldre-PIN er **1234**. Bytt den under Foreldre → Mer.

Slik starter serveren automatisk (Linux/Raspberry Pi):
```
sudo npm i -g pm2 && pm2 start server.js --name gaming-coins && pm2 save && pm2 startup
```

Gi maskinen en fast IP-adresse i ruteren (LAN → DHCP-server → manuell tildeling), slik at adressen ikke endrer seg.

## Koble til ruteren

1. Gå til Foreldre → **Ruter** og trykk **Skann nettverket**. Appen finner ruteren og viser merke og modell
   (via UPnP, FRITZ!Box TR-064, MikroTik REST og ruterens nettside) og om den kan styres direkte.
2. Trykk **Bruk …**, fyll inn passordet og trykk **Lagre** og deretter **Test tilkobling**. Testen leser den nøyaktige modellen fra ruteren.
3. Gå til Barn og enheter, trykk **Hent fra ruteren** og velg PlayStation, iPad osv. for hvert barn.
4. Slå på **Ruterstyring**.

### Hvilke rutere støttes?

| Type | Rutere | Slik stenges internett |
|---|---|---|
| **ASUS** | Asuswrt og Merlin (RT, GT, TUF, ZenWiFi) | Foreldrekontroll → «Blokker internett» |
| **OpenWrt** | OpenWrt/LuCI, GL.iNet, Turris m.fl. | Brannmurregel per enhet (ubus) |
| **MikroTik** | RouterOS 7 (REST-API) | Drop-regel per enhet |
| **UniFi** | Dream Machine, Cloud Gateway, UniFi-kontroller | Blokkerer klienten i UniFi |
| **FRITZ!Box** | AVM FRITZ!Box (TR-064) | «Sperr internett» per enhet |
| **AdGuard Home** | **Alle rutere** | DNS-sperre per enhet |
| **Webhook / Home Assistant** | **Alle** som kan automatiseres | Du bestemmer selv |

**Har du en ruter som ikke kan styres direkte** (f.eks. TP-Link Deco, Netgear Orbi, eero, Google Nest,
eller ruteren fra Telenor, Telia, Altibox eller Get)? Da har ruteren ikke et åpent grensesnitt for styring. Bruk en av disse i stedet:

* **AdGuard Home** (anbefalt). Kjør AdGuard Home på samme server, for eksempel i Docker via aaPanel.
  Sett deretter serverens IP som DNS-server i ruterens DHCP-innstillinger. Gaming Coins slår av DNS for barnas enheter når de ikke skal spille.
  Enheter med egen, manuelt satt DNS kan komme rundt dette.
* **Home Assistant**. Hvis Home Assistant allerede styrer ruteren din, gir du Gaming Coins adressen til en webhook-automasjon.
  Appen sender `{"devices":[{"mac":"…","name":"…","block":true}]}` ved hver endring.

**Viktig å vite**
* Asus og flere andre har ikke et offisielt API. Appen bruker de samme interne grensesnittene som produsentenes egne apper og Home Assistant.
  Test alltid med **Test tilkobling**.
* Asus tillater bare én admin-innlogging om gangen. Hvis du er logget inn på ruterens nettside, kan appen og nettsiden logge hverandre ut.
* For UniFi må du bruke en lokal admin-konto, ikke Ubiquiti-skykontoen. FRITZ!Box krever at «Tilgang for applikasjoner» (TR-064) er slått på.
* Pågående nettøkter kan fortsette en kort stund etter at enheten stenges, avhengig av ruteren.
* På iPhone og iPad: slå av **Privat Wi-Fi-adresse** for hjemmenettet (Innstillinger → Wi-Fi → (i)). Ellers kan MAC-adressen endre seg.
  Det samme gjelder «Tilfeldig MAC» på Android.
* Data og ruterpassord lagres i `data/data.json` på hjemmeserveren. Ta vare på den filen.

## Filer

| Fil | Hva |
|---|---|
| `server.js` | Hjemmeserveren. Lagrer data, sjekker tiden hvert 5. sekund og styrer ruteren |
| `net.js` | Nettverksskanner og modellgjenkjenning |
| `mailer.js` | Sender e-postvarsler (SMTP) |
| `drivers/` | Én fil per rutertype (asus, openwrt, mikrotik, unifi, fritzbox, adguard, webhook) |
| `public/index.html` | Selve appen (barn og foreldre) |
| `public/logic.js` | Spillereglene (coins, frister, butikk, tidsplan) |

Uten server, for eksempel når du åpner `index.html` direkte, kjører appen i **demo-modus** på den enkelte enheten, uten ruterstyring.

## Familiepotten 💎
Alle barna samler diamanter i én felles pott: fra læringsspill (minst 8 av 10 riktige), en andel av oppdrags-coinsene, og ved å gi bort coins (10 coins = 1 💎 som standard). Diamantene brukes i familiebutikken på ting dere gjør sammen – Leos Lekeland, svømmehallen, hytta, tur til Sverige. Kjøp havner under Godkjenn. Alt kan justeres under Foreldre → Butikk.

## Egen PIN per barn 🔒
Under Foreldre → Barn og enheter kan hvert barn få en egen 4-sifret PIN. Da må PIN-koden tastes for å åpne kontoen, og serveren avviser handlinger for barnet uten riktig PIN.

## Automatisk godkjenning ⚡
Under Foreldre → Godkjenn kan dere slå på automatisk godkjenning for alle eller utvalgte barn. Oppdrag godkjennes selv når de er levert innenfor fristen og barnet har brukt minst en viss andel av tiden (standard 25 %). Det som går mistenkelig fort, venter på dere merket «Veldig raskt». Automatisk godkjente oppdrag vises (og sendes på e-post hvis varsler er på) – trykk «Lurte» for å ta coinsene tilbake, trekke straff og stenge internett i noen minutter.
