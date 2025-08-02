# 📘 SNIPER-KB – Teknisk Referens

Detta är en kompletterande kunskapsbas för GPT:n Koppsnipern. Den används tillsammans med `docs/sniper_playbook.md` och innehåller hårdkodade regler, trösklar och mönster.

---

## 🎯 Strategi: Cupsyy-triggered entry

Snipern analyserar automatiskt nya pooler på LaunchLab. Flödet är:

1. **Filtrera nya pooler** direkt efter att de skapats:
   - Likviditet ≥ 5 SOL
   - Slippage < 8 %
   - Inga rug-signaler
   - Godkänd metadata och verifiering

2. **Om poolen klarar filtren:**
   - Förbered köp med rätt storlek (0.25–1.0 SOL)
   - Avvakta exekvering

3. **Exekvera köp först om Cupsyy går in:**
   - Wallet: `suqh5sHtr8HyJ7q8scBimULPkPpA557prMG47xCHQfK`
   - Lyssna efter inkommande buy-TX från denna wallet
   - Om den sker: köp omedelbart, inom max 2 sekunder

---

## 💰 Exit-logik (försäljning)

- **Target**: +10 % (eller enligt `take_profit`)
- **Stop-loss**: −2 %
- **Säljstrategi**: 1 eller 2 transaktioner beroende på djupled i orderboken
- Inga partial-sells eller DCA

---

## 🧱 Tekniska filter (komplement till playbook)

- rug-score < 70 → blockera
- creator_fee > 5 % → blockera
- deployer utan tidigare historik → flagga
- wash-trading eller spoofingmönster → blockera

---

## 📉 Observationsmönster från framgångsrika traders

- Cupsyy köper ofta exakt 0.5 SOL
- Träffar bra tokens inom 3 sek från LP-add
- Undviker tokens utan metadata, ikon, verifiering

---

## 🧠 GPT-användning

Använd denna fil när du:
- Förbättrar eller förklarar köplogik
- Designar lyssningslogik för Cupsyy
- Skapar triggers för exekvering efter extern wallet
- Hanterar take-profit / stop-loss-logik