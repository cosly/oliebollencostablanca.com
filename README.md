# Oliebollen Costa Blanca

Bestelsite voor oliebollen op de Costa Blanca.

## Lokale Development

### Vereisten
- Node.js en npm
- Mailpit (voor lokale email testing)

### Setup

1. **Installeer dependencies:**
   ```bash
   npm install
   ```

2. **Start Mailpit** (voor email testing):
   ```bash
   mailpit
   ```
   - SMTP server: `localhost:1025`
   - Web UI: http://localhost:8025

3. **Initialiseer lokale database:**
   ```bash
   npm run db:init:local
   ```

4. **Start development server:**
   ```bash
   npm run dev:pages
   ```
   - App: http://localhost:8080
   - Emails: http://localhost:8025

### Email Testing

Lokaal worden alle emails verstuurd naar Mailpit in plaats van echte emailadressen. Je kunt ze bekijken op http://localhost:8025.

## Productie Deployment

### Database
Update de remote database:
```bash
wrangler d1 execute oliebollen-db --remote --file=./schema.sql
```

### Environment Variables
Stel de volgende secrets in via Cloudflare dashboard of wrangler:

```bash
wrangler pages secret put RESEND_API_KEY --project-name oliebollencostablanca-com
wrangler pages secret put ADMIN_EMAIL --project-name oliebollencostablanca-com
wrangler pages secret put ADMIN_SECRET --project-name oliebollencostablanca-com
```

### Deploy
```bash
npm run deploy
```

## Features

- 📦 **Bestellingen**: Klanten kunnen oliebollen bestellen met tijdslot selectie
- 📧 **Email confirmatie**: Automatische bevestigingsmail met QR-code
- 👨‍💼 **Admin panel**: Beheer bestellingen en tijdsloten
- 🔒 **Email-based auth**: Secure login via email codes
- 💾 **D1 Database**: Cloudflare D1 voor data opslag
- 🔄 **Real-time updates**: WebSocket support via Durable Objects (te configureren)

## Customer Pre-fill Links

### Individuele klant link genereren

Genereer een persoonlijke bestelLink voor een klant met vooraf ingevulde gegevens:

```bash
node scripts/generate-customer-link.js "John Doe" "john@example.com" "+31612345678"
```

Dit genereert een link zoals:
```
https://oliebollencostablanca.com/?naam=John+Doe&email=john%40example.com&telefoon=%2B31612345678
```

### CSV import voor meerdere klanten

Voor klanten van vorig jaar kun je een CSV bestand maken en in één keer links genereren:

**1. Maak een CSV bestand** (bijv. `customers.csv`):
```csv
naam,email,telefoon
John Doe,john@example.com,+31612345678
Jane Smith,jane@example.com,+31687654321
```

**2. Genereer links:**
```bash
node scripts/csv-to-links.js customers.csv output.txt
```

Dit genereert:
- Een lijst met alle klanten en hun persoonlijke links
- Een email template die je kunt gebruiken
- Optioneel: opslaan in een output bestand

**3. Gebruik de links:**
- Kopieer de individuele links naar WhatsApp/Email
- Klanten kunnen direct bestellen met vooraf ingevulde gegevens
- Geen handmatig typen meer nodig!

### Testing

Test de pre-fill functionaliteit lokaal:
```
http://localhost:8080/?naam=John+Doe&email=john@example.com&telefoon=+31612345678
```

## Tech Stack

- **Cloudflare Pages**: Hosting platform
- **Cloudflare D1**: SQLite database
- **Durable Objects**: Real-time WebSocket support (optioneel)
- **Resend API**: Email delivery (productie)
- **Mailpit**: Email testing (lokaal)
