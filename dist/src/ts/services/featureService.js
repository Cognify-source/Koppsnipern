"use strict";
// src/ts/services/featureService.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FeatureService = void 0;
const child_process_1 = require("child_process");
const path_1 = __importDefault(require("path"));
/**
 * FeatureService anropar Python-scriptet extract.py
 * för att omvandla ett pool-init-event till ett features-dict.
 */
class FeatureService {
    constructor(opts = {}) {
        this.python = opts.pythonPath || "python3";
        this.script = opts.scriptPath || path_1.default.resolve(__dirname, "../../src/ml/extract.py");
    }
    /**
     * Kör extract.py med event-JSON på stdin och returnerar parsed JSON.
     */
    extract(event) {
        const input = JSON.stringify(event);
        const proc = (0, child_process_1.spawnSync)(this.python, [this.script], { input, encoding: "utf-8" });
        if (proc.error) {
            throw proc.error;
        }
        if (proc.status !== 0) {
            throw new Error(`FeatureService failed: ${proc.stderr}`);
        }
        try {
            return JSON.parse(proc.stdout);
        }
        catch (e) {
            throw new Error(`Invalid JSON from feature script: ${proc.stdout}`);
        }
    }
}
exports.FeatureService = FeatureService;
