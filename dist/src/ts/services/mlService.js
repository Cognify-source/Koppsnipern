"use strict";
// src/ts/services/mlService.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MLService = void 0;
const child_process_1 = require("child_process");
const path_1 = __importDefault(require("path"));
/**
 * MLService kör Python-skriptet predict.py för att få en score [0,1].
 */
class MLService {
    constructor(opts = {}) {
        this.python = opts.pythonPath || "python3";
        this.script = opts.scriptPath ||
            path_1.default.resolve(__dirname, "../../src/ml/predict.py");
    }
    /**
     * Kör predict.py med JSON-features på stdin och returnerar float-score.
     */
    predict(features) {
        const json = JSON.stringify(features);
        const proc = (0, child_process_1.spawnSync)(this.python, [this.script], {
            input: json,
            encoding: "utf-8",
        });
        if (proc.error) {
            throw proc.error;
        }
        if (proc.status !== 0) {
            throw new Error(`ML predict failed: ${proc.stderr}`);
        }
        const out = proc.stdout.trim();
        const score = parseFloat(out);
        if (Number.isNaN(score)) {
            throw new Error(`Invalid ML output: ${out}`);
        }
        return score;
    }
}
exports.MLService = MLService;
