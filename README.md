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

```bash
cp .env.example .env
# vervang SESSION_SECRET en QR_SECRET door twee verschillende willekeurige waarden
docker compose up -d db
npx prisma migrate deploy
DEMO_MODE=true npm run db:seed
npm run dev
```

Open `http://localhost:3000`. In demo-modus leidt de primaire login zonder OAuth-configuratie naar het fictieve lid. Voor het bestuur: `/api/auth/demo?role=board`. Demo-modus moet in productie altijd `false` zijn.

## Congressus-configuratie

Maak een nieuwe OAuth-app aan met callback `CONGRESSUS_REDIRECT_URI`; hergebruik niet de callback van de Discord-bot. Vraag `openid profile` en optioneel `groups` aan. Vul een echte, geconfigureerde `CONGRESSUS_BOARD_GROUP_SLUG` in of gebruik de fallbacklijst `CONGRESSUS_BOARD_USER_IDS`. De slug wordt nergens geraden.

De API-key heeft alleen leesrechten voor leden/events/deelnames en schrijfrecht voor aanwezigheid nodig. De officiële limieten zijn 60 verzoeken/minuut en 1.000/uur; synchronisatie leest pagina's van 100 en check-ins gaan via de outbox.

## Productie achter Caddy

```caddy
attendance.sv-realtime.nl {
  encode zstd gzip
  reverse_proxy 127.0.0.1:3000
}
```

Zet `APP_URL` en `CONGRESSUS_REDIRECT_URI` op de HTTPS-URL, `DEMO_MODE=false`, gebruik sterke secrets en start `app`, `db`, `migrate` en `worker` via Compose. De app-container draait als niet-rootgebruiker en heeft een `/api/health`-healthcheck.

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
