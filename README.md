# S.V. RealTime – QR-aanwezigheid

Productiegerichte Next.js-app voor Congressus-login, tijdelijke persoonlijke QR-codes en betrouwbare aanwezigheidsregistratie. Alle Congressus-calls gebeuren server-side. Een check-in wordt eerst atomair in PostgreSQL opgeslagen en daarna via een duurzame outbox gesynchroniseerd.

## Architectuur

- **Next.js App Router / TypeScript** voor UI en serverroutes.
- **PostgreSQL / Prisma** voor ledenkoppelingen, eventcache, deelnames, check-ins, auditlogs en outbox.
- **Congressus OAuth Authorization Code** met een eenmalige, cryptografische state-cookie en Basic-authenticatie bij token exchange.
- **Expliciete identiteitskoppeling:** OAuth `user_id` en API `member_id` worden apart bewaard. Na login zoekt de server exact en uniek op de door Congressus geverifieerde `username`; een ontbrekende of ambigue match wordt geweigerd.
- **QR-tokens:** HS256, audience/issuer/purpose, 75 seconden geldig en 15 seconden kloktolerantie. De QR bevat geen leesbare persoonsgegevens.
- **Scanner:** camera (`@zxing/browser`), keyboard-wedge USB en handmatig zoeken gebruiken dezelfde beveiligde check-inroute.
- **Outboxworker:** idempotente job per check-in, exponentiële backoff, `Retry-After` en maximaal acht pogingen.

De gebruikte API-contracten zijn gecontroleerd tegen `https://api.congressus.nl/v30/openapi.json` (events, participations en beide set-presence-endpoints). Congressus retourneert datums zonder offset als UTC; `event-sync.ts` behandelt die expliciet als UTC en de UI formatteert in `Europe/Amsterdam`.

## Lokaal starten (demo)

De productie-Compose-configuratie forceert bewust `DEMO_MODE=false`. Gebruik voor lokale demo-ontwikkeling een losse, alleen op loopback gepubliceerde PostgreSQL-container en de Node.js-processen op de host:

```bash
cp .env.example .env
# vul lokale secrets in en voeg toe/wijzig:
# DATABASE_URL="postgresql://realtime_demo:demo_only@127.0.0.1:5432/realtime_demo?schema=public"
# APP_URL="http://localhost:3000"
# CONGRESSUS_REDIRECT_URI="http://localhost:3000/api/auth/callback"
# DEMO_MODE="true"
docker run --name realtime-attendance-demo-db -d \
  -e POSTGRES_DB=realtime_demo \
  -e POSTGRES_USER=realtime_demo \
  -e POSTGRES_PASSWORD=demo_only \
  -p 127.0.0.1:5432:5432 \
  postgres:17-alpine
npx prisma migrate deploy
npm run db:seed
npm run dev
```

Open `http://localhost:3000`. In demo-modus leidt de primaire login zonder OAuth-configuratie naar het fictieve lid. Voor het bestuur: `/api/auth/demo?role=board`. Demo-modus moet in productie altijd `false` zijn.

## Congressus-configuratie

Maak een nieuwe OAuth-app aan met callback `CONGRESSUS_REDIRECT_URI`; hergebruik niet de callback van de Discord-bot. Vraag `openid profile` en optioneel `groups` aan. Vul een echte, geconfigureerde `CONGRESSUS_BOARD_GROUP_SLUG` in of gebruik de fallbacklijst `CONGRESSUS_BOARD_USER_IDS`. De slug wordt nergens geraden.

De API-key heeft alleen leesrechten voor leden/events/deelnames en schrijfrecht voor aanwezigheid nodig. De officiële limieten zijn 60 verzoeken/minuut en 1.000/uur; synchronisatie leest pagina's van 100 en check-ins gaan via de outbox.

## Deployment op management-VPS `breeze`

De productie-URL is `https://attendance.sv-realtime-gaming.nl`. Docker publiceert de app uitsluitend als `127.0.0.1:3005`; Caddy handelt publiek verkeer en HTTPS af. PostgreSQL publiceert geen hostpoort.

### 1. Voorbereiding en installatie

Zorg eerst dat het DNS A/AAAA-record van `attendance.sv-realtime-gaming.nl` naar `breeze` wijst. Onderstaande installatiecommando's zijn voor Debian/Ubuntu. Sla deze stap over als Docker Engine met de Compose-plugin al aanwezig is.

```bash
ssh beheerder@breeze
sudo apt-get update
sudo apt-get install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo docker version
sudo docker compose version
```

Gebruik op een niet-Ubuntu Debian-host de officiële Docker-repository voor die distributie. Voeg beheerders niet onnodig aan de `docker`-groep toe: toegang tot Docker is praktisch roottoegang. De voorbeelden gebruiken daarom `sudo docker`.

Maak een vaste applicatiemap en clone de repository:

```bash
sudo install -d -m 0750 -o root -g root /opt/realtime-attendance
sudo git clone <REPOSITORY-URL> /opt/realtime-attendance
cd /opt/realtime-attendance
```

### 2. Productie-`.env` veilig configureren

Maak het bestand root-only. `.dockerignore` en `.gitignore` sluiten `.env` uit van images en Git.

```bash
cd /opt/realtime-attendance
sudo install -m 0600 -o root -g root .env.example .env
openssl rand -hex 32   # POSTGRES_PASSWORD; URL-veilig
openssl rand -hex 64   # SESSION_SECRET
openssl rand -hex 64   # QR_SECRET; gebruik een andere waarde
sudoedit .env
sudo stat -c '%a %U:%G %n' .env
```

Vul minimaal alle `CHANGE_ME`-waarden in. Vereiste productie-instellingen:

```dotenv
POSTGRES_DB="realtime_attendance"
POSTGRES_USER="realtime_attendance"
POSTGRES_PASSWORD="<uit-openssl-rand-hex-32>"
APP_URL="https://attendance.sv-realtime-gaming.nl"
SESSION_SECRET="<eerste-unieke-openssl-rand-hex-64>"
QR_SECRET="<tweede-unieke-openssl-rand-hex-64>"
CONGRESSUS_API_BASE_URL="https://api.congressus.nl/v30"
CONGRESSUS_API_KEY="<api-key>"
CONGRESSUS_BASE_URL="https://www.sv-realtime.nl"
CONGRESSUS_CLIENT_ID="<oauth-client-id>"
CONGRESSUS_CLIENT_SECRET="<oauth-client-secret>"
CONGRESSUS_REDIRECT_URI="https://attendance.sv-realtime-gaming.nl/api/auth/callback"
CONGRESSUS_BOARD_GROUP_SLUG="<echte-geconfigureerde-slug>"
CONGRESSUS_BOARD_USER_IDS=""
DEMO_MODE="false"
```

Registreer exact de bovenstaande callback-URL in Congressus. Zet geen quotes, spaties, `%`, `@`, `:` of `/` in het databasewachtwoord tenzij het eerst correct URL-gecodeerd wordt; de aanbevolen hexwaarde voorkomt dit probleem. Compose forceert zelf `DEMO_MODE=false`, ook als iemand de `.env`-waarde per ongeluk wijzigt.

Controleer de configuratie zonder hem te publiceren of de uitvoer te delen; `docker compose config` bevat opgeloste secrets:

```bash
cd /opt/realtime-attendance
sudo docker compose config --quiet
sudo docker compose config --services
```

Verwachte services: `db`, `migrate`, `app`, `worker`.

### 3. Eerste start en migraties

Build eerst alle doelimages. Start vervolgens de volledige stack. `db` moet gezond zijn, `migrate` moet succesvol met exitcode 0 eindigen en pas daarna starten app en worker.

```bash
cd /opt/realtime-attendance
sudo docker compose build --pull
sudo docker compose up -d
sudo docker compose ps -a
sudo docker compose logs --no-log-prefix migrate
curl --fail --silent --show-error http://127.0.0.1:3005/api/health
```

De migratiecontainer hoort na `prisma migrate deploy` als `Exited (0)` zichtbaar te zijn. Controleer bij twijfel expliciet:

```bash
sudo docker compose run --rm migrate
sudo docker compose exec db sh -c 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
sudo docker compose logs --tail=100 app worker
```

Controleer dat alleen de loopbackbinding bestaat en PostgreSQL niet gepubliceerd is:

```bash
sudo docker compose port app 3000
sudo docker compose port db 5432
sudo ss -ltnp | grep ':3005'
```

De eerste opdracht moet `127.0.0.1:3005` tonen; de database-opdracht hoort geen gepubliceerde poort terug te geven.

### 4. Caddy toevoegen zonder andere diensten te wijzigen

Maak eerst een back-up en voeg uitsluitend dit nieuwe, zelfstandige siteblok aan de bestaande Caddyfile toe. Vervang of herschrijf geen bestaande blokken.

```bash
sudo cp -a /etc/caddy/Caddyfile "/etc/caddy/Caddyfile.backup.$(date +%Y%m%d-%H%M%S)"
sudoedit /etc/caddy/Caddyfile
```

Toe te voegen blok:

```caddy
attendance.sv-realtime-gaming.nl {
  encode zstd gzip
  reverse_proxy 127.0.0.1:3005
}
```

Valideer de volledige bestaande configuratie vóór een reload. `reload` behoudt actieve andere diensten; gebruik geen restart als dat niet nodig is.

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
sudo systemctl status caddy --no-pager
curl --fail --silent --show-error https://attendance.sv-realtime-gaming.nl/api/health
```

Bij een validatiefout: pas de Caddyfile aan of zet de gedateerde back-up terug; reload nooit een ongeldige configuratie.

### 5. Updates uitvoeren

Maak vóór een update een databaseback-up. Bouw daarna nieuwe images, voer migraties uit en vervang alleen app en worker. Gebruik `--ff-only` om onverwachte mergecommits op de VPS te voorkomen.

```bash
cd /opt/realtime-attendance
sudo install -d -m 0700 /var/backups/realtime-attendance
sudo docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' | sudo tee "/var/backups/realtime-attendance/pre-update-$(date +%Y%m%d-%H%M%S).dump" >/dev/null
sudo git pull --ff-only
sudo docker compose config --quiet
sudo docker compose build --pull
sudo docker compose up -d db
sudo docker compose run --rm migrate
sudo docker compose up -d --no-deps app worker
sudo docker compose ps -a
curl --fail --silent --show-error http://127.0.0.1:3005/api/health
```

Ruim oude, ongebruikte images pas na een geslaagde controle op:

```bash
sudo docker image prune
```

### 6. Logs en diagnose

```bash
cd /opt/realtime-attendance
sudo docker compose ps -a
sudo docker compose logs --tail=200 app
sudo docker compose logs --tail=200 worker
sudo docker compose logs --tail=200 db
sudo docker compose logs --since=30m -f app worker
sudo journalctl -u caddy --since '30 minutes ago' --no-pager
```

Voorkom dat secrets of ruwe QR-/OAuth-waarden in supporttickets worden gekopieerd. Deel ook nooit de uitvoer van `docker compose config` of `docker inspect` ongecensureerd.

OAuth-callbackfouten verschijnen als één gestructureerde regel met prefix `[oauth-callback]`, bijvoorbeeld met uitsluitend `requestId`, `code`, `step` en eventueel `httpStatus`. Filter ze zo:

```bash
sudo docker compose logs app | grep '\[oauth-callback\]'
sudo docker compose logs --since=30m app | grep 'OAUTH_'
```

Bij een userinfo-schemafout bevat de regel daarnaast uitsluitend gesaneerde Zod-metadata, nooit de ontvangen waarde:

```json
{"requestId":"...","code":"OAUTH_USERINFO_SCHEMA_INVALID","step":"userinfo_schema","httpStatus":200,"schemaIssues":[{"path":"picture","code":"invalid_format","expected":"url"}]}
```

Voor een typefout kan een veilig `expected` veld aanwezig zijn, bijvoorbeeld `{"path":"is_active","code":"invalid_type","expected":"boolean"}`.

Belangrijkste codes:

- `OAUTH_TOKEN_REQUEST_FAILED`, `OAUTH_TOKEN_HTTP_ERROR`, `OAUTH_TOKEN_SCHEMA_INVALID`: tokenexchange/netwerk, clientconfiguratie of onverwacht tokencontract.
- `OAUTH_USERINFO_REQUEST_FAILED`, `OAUTH_USERINFO_HTTP_ERROR`, `OAUTH_USERINFO_SCHEMA_INVALID`: userinfo-netwerk, HTTP-status of contract.
- `OAUTH_MEMBER_INACTIVE`, `OAUTH_MEMBER_USERNAME_MISSING`: inactief lid of geen bruikbare username in userinfo.
- `OAUTH_MEMBERS_API_REQUEST_FAILED`, `OAUTH_MEMBERS_API_HTTP_ERROR`, `OAUTH_MEMBERS_API_SCHEMA_INVALID`: leden-API niet bereikbaar, geweigerd of afwijkend paginatiecontract.
- `OAUTH_MEMBER_NOT_FOUND`, `OAUTH_MEMBER_AMBIGUOUS`: username levert nul of meerdere exacte ledenmatches op.
- `OAUTH_DATABASE_UPSERT_FAILED`, `OAUTH_SESSION_CREATION_FAILED`: lokale database- of sessiestap mislukt.
- `OAUTH_STATE_INVALID`, `OAUTH_PROVIDER_DENIED`, `OAUTH_CODE_MISSING`, `OAUTH_CONFIG_INVALID`, `OAUTH_UNEXPECTED`: callbackbeveiliging, weigering, ontbrekende code, configuratie of onverwachte fout.

De logger schrijft bewust geen OAuth-code, access token, API-key, secret, username, naam of ruwe Congressus-response.

Fouten van de handmatige activiteiten-synchronisatie hebben prefix `[congressus-sync]`. De melding in `/bestuur` toont een veilige foutcode en `requestId`; zoek die referentie zonder andere logregels of secrets te delen:

```bash
cd /opt/realtime-attendance
sudo docker compose logs --since=30m app | grep '\[congressus-sync\]'
sudo docker compose logs --since=30m app | grep '<REQUEST_ID_UIT_DE_MELDING>'
```

De JSON-regel bevat uitsluitend fase, foutcode, eventuele upstream-HTTP-status, Zod-issuepaden en -codes, duur en verwerkte aantallen. Belangrijke codes zijn `CONGRESSUS_UNAUTHORIZED` (ongeldige of verlopen key), `CONGRESSUS_FORBIDDEN` (onvoldoende event-/deelname- of categorierechten), `CONGRESSUS_RATE_LIMITED`, `CONGRESSUS_SERVER_ERROR`, `CONGRESSUS_TIMEOUT`, `CONGRESSUS_SCHEMA_ERROR`, `SYNC_DATABASE_ERROR` en `SYNC_PARTIAL`. Een gedeeltelijke synchronisatie behoudt eerder geslaagde activiteiten.

### 7. Back-up en herstel

Maak buiten de Docker-volume-opslag regelmatig versleutelde off-hostback-ups. Een consistente PostgreSQL custom-formatback-up:

```bash
cd /opt/realtime-attendance
sudo install -d -m 0700 /var/backups/realtime-attendance
sudo docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' | sudo tee "/var/backups/realtime-attendance/db-$(date +%Y%m%d-%H%M%S).dump" >/dev/null
sudo find /var/backups/realtime-attendance -type f -name 'db-*.dump' -mtime +30 -delete
```

Test herstelprocedures periodiek op een aparte database/VPS. Herstel naar de productiedatabase veroorzaakt downtime en overschrijft data; stop eerst app en worker en maak nog een laatste back-up:

```bash
cd /opt/realtime-attendance
sudo docker compose stop app worker
sudo docker compose exec -T db sh -c 'pg_restore --clean --if-exists --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < /veilig/pad/backup.dump
sudo docker compose up -d app worker
curl --fail --silent --show-error http://127.0.0.1:3005/api/health
```

Het named volume `realtime-attendance-postgres` bewaart PostgreSQL-data over containervervangingen heen. Voer nooit `docker compose down -v` uit op productie: `-v` verwijdert het databasevolume.

## Beheer en privacy

- CSV-export is alleen toegankelijk voor `BOARD`.
- Auditlogs en historische check-ins worden niet cascade-verwijderd.
- `DATA_RETENTION_DAYS` documenteert het afgesproken bewaartermijn; voer verwijdering uitsluitend uit volgens het verenigingsbeleid en bewaar waar nodig een geanonimiseerd financieel/auditspoor.
- Een AVG-export bestaat uit de eigen `User`, `CheckIn` en bijbehorende `AuditLog`-records. Verwijder of anonimiseer profielvelden pas na controle op wettelijke en verenigingsrechtelijke bewaarplichten.
- Log nooit OAuth-codes, tokens, secrets of ruwe QR-inhoud.

## Controle

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
```

Voor live ingebruikname moeten met echte testcredentials nog worden geverifieerd: de exacte toegewezen API-rechten, de werkelijke bestuursgroepslug, één echte username→member-ID-koppeling en aanwezigheid voor zowel een single- als ticketingactiviteit. De applicatie weigert ambigue tickettargets en verandert nooit betaal- of inschrijvingsstatussen.
