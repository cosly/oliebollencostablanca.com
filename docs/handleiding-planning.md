# Handleiding Planning Module

## Wat doet de Planning Module?

De planning module helpt je om de productiedag te plannen. Het berekent:
- **Wanneer** je beslag moet mixen
- **Hoeveel** je per uur moet produceren
- **Waar** knelpunten ontstaan (te weinig capaciteit)
- **Of** je genoeg voorraad hebt voor alle bestellingen

---

## De Planning Tab Openen

1. Ga naar de **Admin Panel**
2. Klik op de tab **Planning**
3. Selecteer de **datum** waarvoor je wilt plannen

---

## Schermindeling

### Linkerkant: Parameters

Hier stel je de productie-instellingen in:

#### Beslag
| Instelling | Wat betekent het |
|------------|------------------|
| Rijstijd (min) | Hoe lang moet beslag rijzen voordat je kunt bakken |
| Mix tijd (min) | Hoe lang duurt het om een batch beslag te maken |
| Max leeftijd (min) | Hoe lang blijft beslag bruikbaar na het rijzen |
| Batch grootte | Hoeveel oliebollen uit één batch beslag |

#### Frituren
| Instelling | Wat betekent het |
|------------|------------------|
| Frituurtijd (sec) | Hoe lang bakt een lading oliebollen |
| Laden/lossen (sec) | Tijd om pan te vullen en legen |

#### Personeel
| Instelling | Wat betekent het |
|------------|------------------|
| Scheppen | Aantal mensen dat beslag in de pan schept |
| Inpakken | Aantal mensen dat oliebollen inpakt |

#### Frituur Units
Vink aan welke pannen/wokken je gebruikt:
- **Pan 1** (22 stuks)
- **Pan 2** (22 stuks)
- **Pan 3** (20 stuks)
- **Wok** (25 stuks)

#### Buffer
| Instelling | Wat betekent het |
|------------|------------------|
| Per uur | Extra oliebollen produceren bovenop bestellingen |
| Pre-opening slot | Start productie vóór opening om buffer op te bouwen |

---

### Rechterkant: Resultaten

#### Samenvatting (bovenaan)
- **Orders**: Totaal aantal bestelde oliebollen
- **Rozijnen**: Aantal rozijnenoliebollen
- **Naturel**: Aantal naturel oliebollen
- **Appel**: Aantal appelbeignets
- **Batches**: Hoeveel keer beslag maken

#### Waarschuwingen
Gekleurde meldingen:
- 🔴 **Rood (Kritiek)**: Tekort onvermijdelijk - actie nodig!
- 🟠 **Oranje (Waarschuwing)**: Let op - mogelijk probleem
- 🔵 **Blauw (Info)**: Ter informatie

#### Planning Tabel
Per tijdslot zie je:

| Kolom | Betekenis |
|-------|-----------|
| Slot | Tijdslot (bijv. 10:00) |
| Vraag | Hoeveel oliebollen besteld voor dit uur |
| Productie | Hoeveel je kunt maken dit uur |
| Voorraad | Hoeveel je op voorraad hebt (kan negatief = tekort!) |
| Knelpunt | Wat limiteert de productie |

**Knelpunten:**
- `scheppen`: Te weinig scheppers
- `frituren`: Pannen zijn de limiet
- `inpakken`: Te weinig inpakkers
- `beslag`: Niet genoeg beslag klaar

#### Beslag Tijdlijn
Visueel overzicht wanneer elke batch beslag:
- Gemixed moet worden
- Klaar is om te gebruiken

Kleuren:
- **Blauw**: Naturel beslag
- **Paars**: Rozijnenbeslag
- **Groen**: Appelbeslag

#### Grafieken
- **Vraag vs Productie**: Lijn toont of productie de vraag bijhoudt
- **Voorraad**: Lijn toont voorraadverloop (moet boven 0 blijven!)

---

## Werkwijze

### 1. Controleer de dag ervoor
- Open planning voor morgen
- Bekijk de samenvatting: hoeveel van elk type?
- Check op rode waarschuwingen

### 2. Pas parameters aan indien nodig
- Te weinig capaciteit? → Meer personeel of extra pan
- Tekorten? → Eerder starten (pre-opening) of grotere batches

### 3. Print de Runsheet
Klik op **Print Runsheet** voor een afdrukbare takenlijst met:
- Alle taken op volgorde van tijd
- Checkboxes om af te vinken
- Waarschuwingen

### 4. Tijdens productie
Volg de runsheet en vink taken af:
- ☐ 06:15 - Mix naturel batch #1
- ☐ 07:00 - Check rijzen batch #1
- ☐ 08:00 - Start productie (pre-opening)
- etc.

---

## Veelvoorkomende Problemen

### "Voorraad wordt negatief"
**Oorzaak**: Vraag is groter dan productiecapaciteit
**Oplossing**:
- Meer frituurpannen aanzetten
- Meer personeel inzetten
- Grotere batches maken
- Eerder beginnen (pre-opening)

### "Beslag limiteert productie"
**Oorzaak**: Beslag is niet op tijd klaar
**Oplossing**:
- Eerder beginnen met mixen
- Rijstijd verkorten (als mogelijk)
- Meer batches parallel maken

### "Rode waarschuwing: tekort onvermijdelijk"
**Oorzaak**: Zelfs met maximale capaciteit niet genoeg
**Oplossing**:
- Accepteer dat sommige klanten moeten wachten
- Of: sluit bestellingen eerder af

---

## Tips

1. **Plan de avond ervoor** - Zo kun je nog personeel regelen
2. **Begin met pre-opening** - Buffer opbouwen voorkomt stress
3. **Houd de runsheet bij** - Vink taken af zodat je niets vergeet
4. **Let op de grafieken** - Voorraadlijn moet boven 0 blijven
5. **Pas parameters aan op ervaring** - Jouw team werkt misschien sneller/langzamer

---

## Sneltoetsen

| Actie | Hoe |
|-------|-----|
| Vernieuwen | Klik "Vernieuwen" of F5 |
| Printen | Klik "Print Runsheet" |
| Parameter wijzigen | Sleep de slider |

---

*Laatste update: December 2025*
