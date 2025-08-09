import fs from 'fs';
import path from 'path';

export class PolicyManager {
    constructor() {
        const policyPath = path.resolve(process.cwd(), 'config', 'operational_policy.json');
        const policyData = fs.readFileSync(policyPath, 'utf-8');
        this.policy = JSON.parse(policyData);
        console.log(`[PolicyManager] Loaded policy v${this.policy.version}: ${this.policy.policy_name}`);
    }

    /**
     * Kontrollerar att en trade följer policyns filter och riskregler
     * @param {Object} poolData - data om den aktuella poolen
     */
    validateTradeDecision(poolData) {
        const filters = this.policy.filters.hard_filters;

        // Kontrollera hårda filter
        if (poolData.WSOL_LP < filters.WSOL_LP_min_SOL)
            throw new Error(`POLICY_VIOLATION: WSOL_LP ${poolData.WSOL_LP} < min ${filters.WSOL_LP_min_SOL}`);

        if (poolData.creator_fee > filters.creator_fee_max_percent)
            throw new Error(`POLICY_VIOLATION: Creator fee ${poolData.creator_fee}% > max ${filters.creator_fee_max_percent}%`);

        if (poolData.mint_authority !== filters.mint_authority)
            throw new Error(`POLICY_VIOLATION: Mint authority mismatch`);

        if (poolData.freeze_authority !== filters.freeze_authority)
            throw new Error(`POLICY_VIOLATION: Freeze authority mismatch`);

        if (poolData.dev_trigger_SOL < filters.dev_trigger_min_SOL)
            throw new Error(`POLICY_VIOLATION: Dev-trigger SOL ${poolData.dev_trigger_SOL} < min ${filters.dev_trigger_min_SOL}`);

        if (poolData.slippage_estimate > filters.slippage_estimate_max_percent)
            throw new Error(`POLICY_VIOLATION: Slippage estimate ${poolData.slippage_estimate}% > max ${filters.slippage_estimate_max_percent}%`);

        if (poolData.RTT_ms > filters.RTT_max_ms)
            throw new Error(`POLICY_VIOLATION: RTT ${poolData.RTT_ms}ms > max ${filters.RTT_max_ms}ms`);

        if (poolData.active_positions >= filters.max_positions_per_wallet)
            throw new Error(`POLICY_VIOLATION: Max positioner per wallet överskriden`);

        // Kontrollera risk & exit-regler
        const risk = this.policy.risk_exit.pause_conditions;
        if (poolData.precision_last_50 < 85)
            throw new Error(`POLICY_VIOLATION: Precision ${poolData.precision_last_50}% < 85%`);
        if (poolData.daily_pnl_percent < -2)
            throw new Error(`POLICY_VIOLATION: Daily P&L ${poolData.daily_pnl_percent}% < -2%`);
        if (poolData.rtt_violation_count >= 3)
            throw new Error(`POLICY_VIOLATION: RTT violation count >= 3`);
        if (poolData.daily_risk_SOL >= this.policy.strategy.max_daily_risk_SOL)
            throw new Error(`POLICY_VIOLATION: Daglig riskcap nådd`);

        return true;
    }

    /**
     * Kontrollerar att en kodändring följer kodändringspolicyn
     * @param {Object} context - { userRequestedChange: bool, approvedByUser: bool }
     */
    validateCodeChange(context) {
        const policy = this.policy.code_change_policy;

        if (!context.userRequestedChange)
            throw new Error("POLICY_VIOLATION: Ingen uttrycklig användarbegäran.");
        if (!context.approvedByUser)
            throw new Error("POLICY_VIOLATION: Ändring ej godkänd av användaren.");

        // Loggning
        console.log("[PolicyManager] Kodändringspolicy följs: OK");
        return true;
    }
}

// Exempelanvändning
/*
const pm = new PolicyManager();
try {
    pm.validateTradeDecision({
        WSOL_LP: 25,
        creator_fee: 2,
        mint_authority: "none",
        freeze_authority: "none",
        dev_trigger_SOL: 2,
        slippage_estimate: 2,
        RTT_ms: 120,
        active_positions: 1,
        precision_last_50: 90,
        daily_pnl_percent: 1,
        rtt_violation_count: 0,
        daily_risk_SOL: 10
    });

    pm.validateCodeChange({ userRequestedChange: true, approvedByUser: true });

    console.log("Alla kontroller passerade!");
} catch (err) {
    console.error(err.message);
}
*/
