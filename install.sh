#!/usr/bin/env bash
# ============================================================
#  Gaming Coins – installasjon for aaPanel / Linux
#
#  Bruk (som root, fra mappen der du pakket ut zip-filen):
#     bash install.sh             installer eller oppdater
#     bash install.sh status      vis status
#     bash install.sh logs        vis logg (Ctrl+C for å avslutte)
#     bash install.sh restart     start på nytt
#     bash install.sh update      hent siste versjon fra GitHub og start på nytt
#     bash install.sh uninstall   fjern tjenesten (data beholdes)
#
#  Valg (sett foran kommandoen):
#     PORT=8080  APP_DIR=/www/wwwroot/gaming-coins  TZ_NAME=Europe/Oslo
# ============================================================
set -euo pipefail

APP_DIR="${APP_DIR:-/www/wwwroot/gaming-coins}"
PORT="${PORT:-8080}"
TZ_NAME="${TZ_NAME:-Europe/Oslo}"
SERVICE="gaming-coins"
UNIT="/etc/systemd/system/${SERVICE}.service"
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE_FALLBACK_VERSION="22.12.0"

g() { printf "\033[1;32m%s\033[0m\n" "$*"; }
y() { printf "\033[1;33m%s\033[0m\n" "$*"; }
r() { printf "\033[1;31m%s\033[0m\n" "$*"; }

[ "$(id -u)" -eq 0 ] || { r "Kjør som root:  sudo bash install.sh"; exit 1; }

case "${1:-install}" in
  status)    systemctl status "$SERVICE" --no-pager; exit 0 ;;
  logs)      journalctl -u "$SERVICE" -f -n 50; exit 0 ;;
  restart)   systemctl restart "$SERVICE"; g "Startet på nytt."; exit 0 ;;
  uninstall)
    systemctl disable --now "$SERVICE" 2>/dev/null || true
    rm -f "$UNIT"; systemctl daemon-reload
    g "Tjenesten er fjernet. Filer og data ligger fortsatt i $APP_DIR"; exit 0 ;;
  update)
    # henter siste versjon fra GitHub (krever at appen er installert med «git clone», se INSTALLER.md)
    [ -d "$APP_DIR/.git" ] || { r "Appen i $APP_DIR er ikke hentet fra GitHub. Se «Oppdatering fra GitHub» i INSTALLER.md."; exit 1; }
    command -v git >/dev/null || { r "git mangler. Installer med: apt install git  (eller yum install git)"; exit 1; }
    g "⬇ Henter siste versjon fra GitHub …"
    git -c safe.directory="$APP_DIR" -C "$APP_DIR" pull --ff-only || { r "Kunne ikke hente oppdateringen (se feilen over)."; exit 1; }
    git -c safe.directory="$APP_DIR" -C "$APP_DIR" log -1 --format='   Nyeste endring: %s (%cr)'
    SRC="$APP_DIR"
    ;;
  install) ;;
  *) r "Ukjent kommando: $1"; exit 1 ;;
esac

echo; g "🎮 Installerer Gaming Coins"; echo

# ---------- 1. Finn Node.js 18+ ----------
node_major() { "$1" -e 'process.stdout.write(process.versions.node.split(".")[0])' 2>/dev/null || echo 0; }
NODE=""
for c in $(command -v node 2>/dev/null) $(ls -d /www/server/nodejs/*/bin/node 2>/dev/null | sort -rV) /usr/local/bin/node /opt/gaming-coins-node/bin/node; do
  [ -x "$c" ] || continue
  if [ "$(node_major "$c")" -ge 18 ]; then NODE="$c"; break; fi
done

if [ -z "$NODE" ]; then
  y "Fant ikke Node.js 18 eller nyere. Laster ned Node $NODE_FALLBACK_VERSION …"
  case "$(uname -m)" in
    x86_64) ARCH=x64 ;; aarch64|arm64) ARCH=arm64 ;; armv7l) ARCH=armv7l ;;
    *) r "Ukjent prosessor $(uname -m). Installer Node.js via aaPanel → App Store → Node.js version manager og kjør på nytt."; exit 1 ;;
  esac
  TMP="$(mktemp -d)"
  URL="https://nodejs.org/dist/v${NODE_FALLBACK_VERSION}/node-v${NODE_FALLBACK_VERSION}-linux-${ARCH}.tar.xz"
  if command -v curl >/dev/null; then curl -fsSL "$URL" -o "$TMP/node.tar.xz"; else wget -qO "$TMP/node.tar.xz" "$URL"; fi
  rm -rf /opt/gaming-coins-node && mkdir -p /opt/gaming-coins-node
  tar -xJf "$TMP/node.tar.xz" -C /opt/gaming-coins-node --strip-components=1
  rm -rf "$TMP"
  NODE=/opt/gaming-coins-node/bin/node
fi
g "✓ Node.js $("$NODE" -v)  ($NODE)"

# ---------- 2. Bruker ----------
if id www >/dev/null 2>&1; then RUN_USER=www; else RUN_USER=root; fi
g "✓ Kjører som bruker: $RUN_USER"

# ---------- 3. Kopier filer (data beholdes ved oppdatering) ----------
mkdir -p "$APP_DIR/data"
if [ "$SRC" != "$APP_DIR" ]; then
  for f in server.js net.js mailer.js package.json README.md INSTALLER.md install.sh; do
    [ -f "$SRC/$f" ] && cp -f "$SRC/$f" "$APP_DIR/"
  done
  rm -f "$APP_DIR/asus.js"
  for d in public drivers; do rm -rf "$APP_DIR/$d" && cp -r "$SRC/$d" "$APP_DIR/$d"; done
fi
[ -f "$APP_DIR/data.json" ] && [ ! -f "$APP_DIR/data/data.json" ] && mv "$APP_DIR/data.json" "$APP_DIR/data/data.json"
[ -f "$SRC/data/data.json" ] && [ ! -f "$APP_DIR/data/data.json" ] && cp "$SRC/data/data.json" "$APP_DIR/data/data.json"
chown -R "$RUN_USER":"$RUN_USER" "$APP_DIR" 2>/dev/null || chown -R "$RUN_USER" "$APP_DIR"
chmod +x "$APP_DIR/install.sh" 2>/dev/null || true
g "✓ Filer lagt i $APP_DIR"

# ---------- 4. Sjekk at porten er ledig ----------
if ! systemctl is-active --quiet "$SERVICE" 2>/dev/null; then
  if command -v ss >/dev/null && ss -ltn | awk '{print $4}' | grep -Eq "[:.]${PORT}\$"; then
    r "Port $PORT er allerede i bruk av et annet program."
    r "Velg en annen port, f.eks.:   PORT=8090 bash install.sh"
    exit 1
  fi
fi

# ---------- 5. systemd-tjeneste (starter automatisk ved omstart) ----------
cat > "$UNIT" <<EOF
[Unit]
Description=Gaming Coins
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$RUN_USER
WorkingDirectory=$APP_DIR
Environment=PORT=$PORT
Environment=TZ=$TZ_NAME
Environment=GC_DATA=$APP_DIR/data/data.json
ExecStart=$NODE $APP_DIR/server.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable "$SERVICE" >/dev/null 2>&1
systemctl restart "$SERVICE"
g "✓ Tjenesten «$SERVICE» er startet og starter automatisk ved omstart"

# ---------- 6. Brannmur ----------
if command -v ufw >/dev/null && ufw status 2>/dev/null | grep -q "Status: active"; then
  ufw allow "$PORT"/tcp >/dev/null && g "✓ Åpnet port $PORT i ufw"
elif command -v firewall-cmd >/dev/null && firewall-cmd --state >/dev/null 2>&1; then
  firewall-cmd --permanent --add-port="$PORT"/tcp >/dev/null && firewall-cmd --reload >/dev/null && g "✓ Åpnet port $PORT i firewalld"
else
  y "! Fant ingen aktiv brannmur å åpne automatisk. Åpne port $PORT i aaPanel → Security hvis appen ikke svarer."
fi

# ---------- 7. Sjekk at den svarer ----------
OK=0
for i in 1 2 3 4 5 6 7 8 9 10; do
  if "$NODE" -e "fetch('http://127.0.0.1:$PORT/api/state').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then OK=1; break; fi
  sleep 1
done

echo
if [ "$OK" = 1 ]; then
  g "🎉 Gaming Coins kjører!"
  echo
  echo "   Åpne på iPad / veggskjerm:"
  for ip in $(hostname -I 2>/dev/null); do
    case "$ip" in *:*) ;; *) echo "     http://$ip:$PORT" ;; esac
  done
  echo
  echo "   Foreldre-PIN første gang: 1234  (bytt under Foreldre → Mer)"
  echo "   Data lagres i: $APP_DIR/data/data.json"
  echo "   Logg:          bash $APP_DIR/install.sh logs"
else
  r "Tjenesten startet ikke som forventet. Siste logglinjer:"
  journalctl -u "$SERVICE" -n 30 --no-pager || true
  exit 1
fi
