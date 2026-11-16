# 🎯 Marktplaats Radar

Een persoonlijke "sniper" voor Marktplaats. Je stelt in wat je zoekt en tot welke prijs. De radar kijkt **elke minuut** mee en stuurt je binnen seconden een **Telegram-bericht** zodra er een nieuwe advertentie verschijnt die past. Zo ben je er als eerste bij.

Alles draait op het **gratis plan van Cloudflare Workers**. Er is geen server nodig en het kost niets.

## Functies

- **Snipers** met 1–3 zoektermen, min/max-prijs, uitsluitwoorden, postcode + afstand, categorie en "alleen in titel".
- **Elke minuut** een controle per zoekterm. Gesponsorde advertenties (dagtoppers) worden weggefilterd.
- **Prijsdalingen:** een advertentie die eerst te duur was, wordt alsnog gemeld zodra de prijs onder je maximum zakt.
- **Koopjesscore:** "45% onder gangbaar", vergeleken met de middelste vraagprijs van vergelijkbare advertenties.
- **Telegram-berichten** met foto, prijs, plaats en link, plus knoppen:
  - 🔕 sniper 1 uur pauzeren
  - 👎 verkoper blokkeren
  - ⭐ bewaren
- **Stille uren** (standaard 23:00–07:00). 's Nachts gaan er geen berichten uit; om 07:00 krijg je één ochtendoverzicht.
- **Geen spam:**
  - een stille nulmeting bij nieuwe of gewijzigde snipers;
  - elke advertentie wordt hooguit één keer gemeld;
  - maximaal 5 berichten per sniper per minuut.
- **Webpagina** (met wachtwoord) om snipers te beheren en per sniper de laatste vondsten te zien.
- **Statuspagina** (`/status`):
  - gezondheid, runs per uur en afgebroken runs;
  - per zoekterm de responstijd van Marktplaats;
  - de laatste fouten en het verbruik van het gratis plan.

## Hoe het werkt

```
cron (elke minuut)
  └─ per actieve zoekterm een eigen aanroep van de Worker (eigen 10 ms CPU-budget)
       ├─ Marktplaats zoek-API (100 nieuwste, zo nodig pagina 2)
       ├─ vergelijken met "gezien" in D1 → nieuw of in prijs gedaald?
       ├─ filters (prijs, woorden, categorie, verkoper)
       └─ Telegram-bericht + vondst opslaan
```

- **Runtime:** Cloudflare Workers (TypeScript), cron trigger `* * * * *`
- **Opslag:** Cloudflare D1 (SQLite)
- **Meldingen:** Telegram Bot API, met webhook voor de knoppen
- **Tests:** Vitest met `@cloudflare/vitest-plugin`

De radar is gebouwd rond de grenzen van het gratis plan:
- een rustige minuut kost één database-aanroep;
- er worden alleen nieuwe advertenties en prijswijzigingen weggeschreven;
- statistieken worden per uur opgeteld in plaats van per run opgeslagen.

## Zelf installeren

Je hebt nodig: Node.js 20+, een (gratis) Cloudflare-account en een Telegram-bot (maak er een via [@BotFather](https://t.me/BotFather)).

```bash
npm install
npx wrangler login
npx wrangler d1 create marktplaats-radar   # zet de database_id in wrangler.toml
npx wrangler d1 migrations apply DB --remote
```

Stel de geheimen in:

```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN   # token van BotFather
npx wrangler secret put TELEGRAM_CHAT_ID     # jouw chat-id (bijv. via @userinfobot)
npx wrangler secret put APP_PASSWORD         # wachtwoord voor de webpagina
openssl rand -hex 32 | npx wrangler secret put SESSION_SECRET
openssl rand -hex 32 | npx wrangler secret put INTERNAL_TOKEN
```

Zet het daarna live:

```bash
npx wrangler deploy
```

Daarna:
1. Druk in Telegram op **Start** bij je bot. Een bot mag je pas berichten sturen als jij eerst iets hebt gestuurd.
2. Open de URL van je Worker en log in.
3. Druk onderaan op **Telegram-knoppen activeren**.
4. Maak je eerste sniper aan.

## Ontwikkelen

```bash
npm test             # alle tests
npm run typecheck
npx wrangler dev     # lokaal; maak eerst .dev.vars met de geheimen hierboven
```

## Let op

- De radar gebruikt de **niet-officiële** zoek-API die marktplaats.nl zelf gebruikt. Die kan zonder aankondiging veranderen. Op de statuspagina en via een Telegram-waarschuwing zie je het als dat gebeurt.
- Bedoeld voor **persoonlijk gebruik** met een paar snipers. Respecteer de gebruiksvoorwaarden van Marktplaats en vraag niet vaker op dan nodig.
- Niet verbonden aan Marktplaats of Adevinta.
