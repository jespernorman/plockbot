# Plockbot

Eget program – **helt avskilt från Ruttbot och Navigator backend.**

Tar emot PDF med plockordrar, översätter enligt regler (t.ex. kassetter: 1 kasset = 20 st) till plockinstruktioner, och genererar en ny PDF.

## Köra lokalt

```bash
npm install
npm run dev
```

Öppnar http://localhost:5174

## Bygga för produktion

```bash
npm run build
```

Filer hamnar i `dist/`. Deploya till valfri statisk host eller server.

## Koppling till Ruttbot

- Ruttbot visar fliken **Plockbot** endast för kunder som finns i `RuttbotFrontend/src/config/customPages.ts` (`PLOCKBOT_COMPANY_IDS`).
- På ruttbot.com/plockbot visas denna app i en iframe. Sätt `VITE_PLOCKBOT_URL` i Ruttbot till den URL där Plockbot är utlagd (t.ex. `https://plockbot.ruttbot.com` eller samma domän).

Ingen delad kod eller backend med Ruttbot/Navigator.
