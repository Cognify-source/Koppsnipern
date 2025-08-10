# Eskaleringsmatris - Koppsnipern

## Eskaleringsscenarier

| Scenario | Severity | Action | Timeline | Format |
|----------|----------|---------|----------|---------|
| Säkerhetsrisk identifierad | CRITICAL | Stopp + eskalera | Omedelbart | "🚨 SÄKERHETSRISK: [beskrivning]" |
| Produktionskritisk bugg | HIGH | Stopp + eskalera | Omedelbart | "❌ KRITISK BUGG: [beskrivning]" |
| Performance-degradation | MEDIUM | Logga + fortsätt + flagga | Inom session | "⚠️ PERFORMANCE: [metrics]" |
| Modulkonflikt | MEDIUM | Konsultera OP + eskalera vid tvivel | Innan implementation | "🔄 KONFLIKT: [moduler] - [problem]" |
| Osäker OP-tolkning | LOW | Stoppa + eskalera | Före fortsatt utveckling | "❓ OP-TOLKNING: [sektion] - [fråga]" |

## Eskaleringsformat

### CRITICAL/HIGH Priority
```
🚨 **ESKALERING - [SEVERITY]**

**Problem**: [Kort beskrivning]
**Påverkan**: [Vad som kan gå fel]
**Kontext**: [Vad du höll på med]
**OP-referens**: [Relevant sektion om tillämplig]
**Rekommendation**: [Förslag på lösning]

**VÄNTAR PÅ INSTRUKTIONER**
```

### MEDIUM/LOW Priority
```
⚠️ **FLAGGA - [SCENARIO]**

**Situation**: [Vad som upptäckts]
**Påverkan**: [Begränsad/ingen omedelbar risk]
**Förslag**: [Möjliga vägar framåt]
**Fortsättning**: [Vad som kan göras medan vi väntar]
```

## Automatiska Triggers

### Performance Degradation
```javascript
// Auto-trigger vid:
if (latency > 350ms) {
  log("⚠️ PERFORMANCE: Latency överskriden");
  flag_for_review = true;
}

if (precision < 85) {
  log("🚨 SÄKERHETSRISK: Precision under minimum");  
  escalate_immediately = true;
}
```

### Development Blockers
**Auto-eskalering vid:**
- Checkpoint utan svar > 10 minuter
- Repeterade konflikter mellan moduler
- OP-tolkning som påverkar säkerhetsparametrar
- RPC/Jito integration fel under utveckling

## Fortsättningsprotokoll

### Under eskalering:
- **CRITICAL/HIGH**: Stoppa all relaterad utveckling
- **MEDIUM**: Fortsätt med icke-relaterade uppgifter  
- **LOW**: Dokumentera och fortsätt med föreslagna antaganden

### Efter löst eskalering:
- Uppdatera relevant dokumentation
- Lägg till förtydligande i instruktioner om återkommande
- Testa lösningen innan fortsatt utveckling

## Kommunikationskanaler

### Utveckling:
- **Allmänna frågor**: Standard utvecklingsdiskussion
- **Checkpoint-godkännanden**: Strukturerat format enligt checkpoint-guide
- **Eskaleringar**: Enligt eskaleringsmatris format

### Produktion:
- **Discord notifications**: Max 3 meningar enligt kommunikationsprotokoll
- **Intern logging**: 100 ord max, strukturerat JSON
- **Krisstatus**: Omedelbar notifikation med severity-level