# Installere Gaming Coins på aaPanel – 3 steg

> **Viktig:** For at ruterstyringen og skanningen skal virke, må serveren stå **hjemme, på samme nettverk som ruteren**.
> Står aaPanel på en server i skyen (VPS), virker appen, men den når ikke ruteren.

## 1. Last opp
aaPanel → **Files** → gå til `/www/wwwroot` → **Upload** → velg `gaming-coins.zip`.
Høyreklikk på zip-filen → **Unzip**. Da får du mappen `/www/wwwroot/gaming-coins`.

## 2. Kjør installasjonen
aaPanel → **Terminal** (eller SSH som root), og lim inn:

```
cd /www/wwwroot/gaming-coins && bash install.sh
```

Skriptet gjør dette selv:
* finner Node.js 18 eller nyere (også versjoner installert med aaPanels Node.js version manager), eller laster ned Node hvis den mangler
* gjør klar data-mappen og setter riktige rettigheter
* lager en tjeneste som starter automatisk når serveren starter på nytt
* åpner port 8012 i brannmuren (ufw/firewalld) hvis den er aktiv
* sjekker at appen svarer, og skriver ut adressen du skal bruke

## 3. Åpne appen og koble til ruteren
Gå til adressen skriptet skriver ut, f.eks. `http://192.168.50.10:8012`, på iPaden eller veggskjermen.
Trykk Del → **Legg til på Hjem-skjerm**. Foreldre-PIN første gang er **1234**.

Gå deretter til Foreldre → **Ruter** → **Skann nettverket**. Appen finner ruteren og viser merke og modell.

Svarer ikke siden? Åpne port **8012** under aaPanel → **Security** → Add port rule.

---

### Nyttige kommandoer
```
bash /www/wwwroot/gaming-coins/install.sh status     # kjører den?
bash /www/wwwroot/gaming-coins/install.sh logs       # se loggen (ruter-feil vises her)
bash /www/wwwroot/gaming-coins/install.sh restart    # start på nytt
bash /www/wwwroot/gaming-coins/install.sh uninstall  # fjern tjenesten (data beholdes)
```

Annen port: `PORT=8090 bash install.sh`

### Oppdatere til ny versjon
Pakk ut den nye zip-filen i den samme mappen, svar «ja» til å overskrive, og kjør `bash install.sh` igjen.
Barn, coins og innstillinger ligger i `data/data.json` og blir ikke rørt.

### Oppdatering fra GitHub (anbefalt)
Koden ligger i et privat GitHub-repo. Når serveren er koblet til det, oppdaterer du med én kommando:
```
bash /www/wwwroot/gaming-coins/install.sh update
```

**Engangsoppsett (ca. 5 min)** – i aaPanel → Terminal:

1. Lag en egen nøkkel for serveren:
   ```
   ssh-keygen -t ed25519 -N "" -f ~/.ssh/gaming-coins -C "gaming-coins server"
   cat ~/.ssh/gaming-coins.pub
   ```
2. Kopier linjen som vises. På GitHub: repoet → **Settings → Deploy keys → Add deploy key**. Lim inn, gi den navnet «server», og la «Allow write access» være **av**.
3. Fortell serveren hvilken nøkkel den skal bruke:
   ```
   cat >> ~/.ssh/config <<'CFG'
   Host github-gaming-coins
     HostName github.com
     User git
     IdentityFile ~/.ssh/gaming-coins
     IdentitiesOnly yes
   CFG
   ```
4. Bytt fra zip-installasjon til GitHub (data i `data/` beholdes):
   ```
   cd /www/wwwroot
   git clone git@github-gaming-coins:yamenhammoudeh/gaming-coins.git gaming-coins-git
   cp -a gaming-coins/data gaming-coins-git/ 2>/dev/null
   mv gaming-coins gaming-coins-gammel && mv gaming-coins-git gaming-coins
   bash gaming-coins/install.sh
   ```
   Fungerer alt, kan du slette `gaming-coins-gammel` senere.

Etter dette: `bash /www/wwwroot/gaming-coins/install.sh update` henter nyeste versjon og starter appen på nytt.
Mappen `data/` (passord, barn, coins) lastes aldri opp til GitHub.

### Sikkerhetskopi
Last ned `/www/wwwroot/gaming-coins/data/data.json` fra Files en gang iblant.

### Bruke appen utenfor hjemmet? (valgfritt)
Ikke åpne port 8012 mot internett. Barnas knapper har ingen innlogging, og ruterpassordet ligger på serveren.
Vil du likevel nå appen ute, bruk aaPanel → Website → Add site (ditt domene) → **Reverse proxy** til `http://127.0.0.1:8012`.
Slå på **SSL** og **passordbeskyttelse** (Encrypted access) på den siden. Alternativet er å bruke VPN hjem, for eksempel Asus sin innebygde VPN-server.

### Bruker du heller aaPanels «Node Project»?
Det går også: Website → **Node Project** → Add.
* Prosjektmappe: `/www/wwwroot/gaming-coins`
* Run opt: `start`
* Port: `8012`
* Bruker: `www`
* Node-versjon: 18 eller nyere

Bruk **enten** dette **eller** `install.sh`, ikke begge, ellers kjemper de om samme port.
`install.sh` er anbefalt, fordi aaPanels Node Project av og til mister oppstartsinnstillingene etter oppdateringer.
