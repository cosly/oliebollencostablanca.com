# Planning & Productie Simulatie - Design Document

**Datum:** 2025-12-29
**Status:** Gevalideerd
**Versie:** 1.0

## Samenvatting

Productie planning module voor het oliebollen ERP systeem. Berekent beslag planning, detecteert bottlenecks, en genereert een printbare operator runsheet.

## Scope MVP

### Outputs (alle drie essentieel)
1. **Beslagplanning** - mix-starttijden per batch
2. **Bottleneck detectie** - welke stap limiteert per slot
3. **Voorraad/tekort overzicht** - stock flow per tijdslot

### Beslissingen
- Nieuwe tab in bestaande admin (naast Orders, Settings)
- Parameters als sliders/inputs direct op pagina (instant feedback)
- Live data uit database (altijd actueel)
- Configureerbaar aantal frituur units met eigen profiel
- 3 aparte beslagtypes: plain, rozijnen, appel (elk eigen batches)
- Pre-opening slot (08:00-09:00) voor buffer opbouwen
- Operator runsheet is essentieel (printbaar A4)
- Basis lijngrafieken voor visualisatie

---

## Architectuur

### Module Positie
```
[Orders] [Planning] [Settings]
              ↑ nieuw
```

### Data Flow
```
Orders (DB) → Aggregatie per slot → Planning Engine → UI
```

Planning Engine is pure JavaScript, client-side, stateless:
```javascript
simulateDay(date, orders, parameters) → PlanningResult
```

---

## Data Model

### Bestaande data (read-only)
Orders aggregatie per pickup_hour en product_id.

### Nieuwe data

**planning_parameters** (in config tabel):
```javascript
{
  // Beslag
  batter_batch_size: 60,
  batter_mix_time_min: 15,
  batter_rise_time_min: 45,
  batter_max_age_min: 120,

  // Scheppen
  scoop_time_sec: 8,
  scoop_workers: 2,

  // Frituren
  fry_time_sec: 180,
  load_unload_sec: 30,

  // Inpakken
  pack_time_sec: 20,
  bag_size_balls: 10,
  bag_size_apple: 5,
  pack_workers: 1,

  // Buffer
  buffer_per_hour: 10,

  // Timing
  pre_open_slot: true,
  pre_open_start: "08:00"
}
```

**fry_units** (configureerbaar):
```javascript
[
  { id: 1, name: "Pan 1", type: "fryer", active: true, batch_capacity: 22 },
  { id: 2, name: "Pan 2", type: "fryer", active: true, batch_capacity: 22 },
  { id: 3, name: "Pan 3", type: "fryer", active: true, batch_capacity: 20 },
  { id: 4, name: "Wok", type: "wok", active: true, batch_capacity: 25 }
]
```

---

## Simulatie Logica

### Capaciteitsberekening per uur

**Scheppen:**
```javascript
cap_scoop = scoop_workers * (3600 / scoop_time_sec)
```

**Frituren:**
```javascript
cycle_time = fry_time_sec + load_unload_sec
batches_per_hour = Math.floor(3600 / cycle_time)
cap_fry = sum(active_units.map(u => batches_per_hour * u.batch_capacity))
```

**Inpakken:**
```javascript
bags_per_hour = pack_workers * (3600 / pack_time_sec)
cap_pack_balls = bags_per_hour * bag_size_balls
```

### Bottleneck detectie
```javascript
effective_capacity = Math.min(cap_scoop, cap_fry, cap_pack, batter_available)
bottleneck = identify_limiting_factor()
```

### Voorraad flow
```javascript
stock[t+1] = stock[t] + production[t] - demand[t]
```

### Beslag planning (backward scheduling)
```javascript
ready_time = slot_start - safety_margin
mix_start = ready_time - rise_time - mix_time
```

---

## UI Layout

```
┌─────────────────────────────────────────────────────────────┐
│  📅 Datum: [31 dec 2025 ▼]              [🖨️ Print Runsheet] │
├──────────────────┬──────────────────────────────────────────┤
│ PARAMETERS       │  PLANNING OVERZICHT                      │
│                  │  Tabel: Slot | Vraag | Prod | Voorr | BN │
│ ▸ Beslag         ├──────────────────────────────────────────┤
│ ▸ Frituren       │  BESLAG TIMELINE                         │
│ ▸ Personeel      │  Visuele batch planning                  │
│ ▸ Frituur Units  ├──────────────────────────────────────────┤
│                  │  📊 GRAFIEKEN                            │
│                  │  Vraag/Productie + Voorraad              │
└──────────────────┴──────────────────────────────────────────┘
```

### Interacties
- Slider wijzigen → instant herberekening
- Unit aan/uit → capaciteit herberekenen
- Bottleneck cel klikken → tooltip met uitleg
- Print Runsheet → printbare A4 versie

---

## Operator Runsheet

Printbare A4 met:
- Samenvatting (totaal orders per product, aantal batches)
- Chronologische takenlijst met checkboxes
- Waarschuwingen sectie

Taak types:
- Mix batch
- Check rijzen
- Productie targets
- Waarschuwingen inline

---

## Waarschuwingen

| Severity | Wanneer |
|----------|---------|
| 🔴 Critical | Tekort onvermijdelijk, beslag niet op tijd |
| 🟠 Warning | Beslag verloopt, bottleneck dreigt |
| 🔵 Info | Buffer laag, piekuur nadert |

---

## Technische Implementatie

### Nieuwe bestanden
```
js/planning.js          # UI logica
js/planning-engine.js   # Pure simulatie functies
functions/api/planning-data.js  # Orders aggregatie API
admin.html              # Planning tab toevoegen
```

### API Endpoint
```
GET /api/planning-data?date=2025-12-31
```
Retourneert orders geaggregeerd per uur en product.

### Parameters opslag
In bestaande `config` tabel als JSON.

---

## Niet in scope (MVP)

- Real-time voortgang tracking
- Automatische optimalisatie
- Switch-cost tussen producten
- Scenario's opslaan/vergelijken
- Team planning (wie doet wat)
