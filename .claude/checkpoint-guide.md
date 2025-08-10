# Checkpoint System - Koppsnipern

## Checkpoint Definition
**Checkpoint = Obligatorisk verifiering före:**
- Ändringar i produktionskritisk kod (se definition nedan)
- Modifikationer som påverkar riskparametrar
- Integrationer mellan moduler
- Performance-kritiska optimeringar (latency < 350ms)

## Produktionskritisk Kod

### Moduler som ALLTID kräver checkpoint:
- **TradeService**: Alla transaktionsrelaterade funktioner
- **RiskManager**: Stop-loss, position sizing, risk limits
- **BundleSender**: Jito bundle creation och submission
- **SafetyService**: Rug checks, blacklist validation

### Specifika funktioner:
- Transaktions- och säkerhetsvalidering
- Real-time streaming och signalhantering  
- Exit/stop-loss logik
- Wallet och position management

## Checkpoint-Process (steg-för-steg)

### Steg 1: Analys
```
**CHECKPOINT BEGÄRD**

**Ändringens syfte**: [Vad ska ändras och varför]
**Berörda moduler**: [Lista alla påverkade moduler/filer]
**Performance-impact**: [Påverkan på 350ms latency budget]
```

### Steg 2: Riskbedömning
```
**Riskanalys**:
- **Säkerhetsrisk**: [Potential för ekonomisk förlust]
- **Performance-risk**: [Påverkan på precision/latency targets]
- **Integration-risk**: [Påverkan på andra moduler]
- **Failsafe-påverkan**: [Ändringar i auto-pause/stop triggers]
```

### Steg 3: OP-Validering
```
**OP-referens**: 
- Sektion: [Relevant paragraf i operational_policy.json]
- Citat: "[Exakt text som stödjer ändringen]"
- Tolkning: [Hur detta appliceras på aktuell ändring]
```

### Steg 4: Teststrategi
```
**Valideringsplan**:
- **Enhetstester**: [Specifika testfall]
- **Devnet-test**: [Scenario att testa]  
- **Performance-mätning**: [Metrics att övervaka]
- **Rollback-plan**: [Hur ångra om något går fel]
```

### Steg 5: Godkännande
**Format**: "Väntar på uttryckligt 'OK' eller 'GODKÄNT' för implementation..."

## Exempel på Checkpoint

```
**CHECKPOINT BEGÄRD**

**Ändringens syfte**: Implementera trailing stop-loss i RiskManager
**Berörda moduler**: RiskManager, TradeService (exit signals)
**Performance-impact**: +5ms latency för trailing calculation

**Riskanalys**:
- **Säkerhetsrisk**: Låg - förbättrar risk management
- **Performance-risk**: Minimal - 5ms inom budget
- **Integration-risk**: Medium - TradeService måste hantera nya exit signals
- **Failsafe-påverkan**: Ingen - använder befintliga stop-loss triggers

**OP-referens**: 
- Sektion: risk_exit.exit_rules.trailing_tp
- Citat: "activate_at_ROI_percent: 12, lock_profit_percent: 6, stop_loss_follow_percent: 3"
- Tolkning: Implementera enligt exakta parametrar i OP

**Valideringsplan**:
- **Enhetstester**: Test med ROI 12%, 15%, 20% scenarios
- **Devnet-test**: 10 trades med trailing stop aktivering
- **Performance-mätning**: Latency per trade exit decision  
- **Rollback-plan**: Feature flag för snabb disable

Väntar på uttryckligt 'OK' för implementation...
```