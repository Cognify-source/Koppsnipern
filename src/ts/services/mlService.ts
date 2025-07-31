// src/ts/services/mlService.ts

import { spawnSync } from "child_process";
import path from "path";

export interface MLServiceOptions {
  pythonPath?: string;      // ex. "python3" eller full sökväg
  scriptPath?: string;      // ex. path.resolve(..., "src/ml/predict.py")
}

/**
 * MLService kör Python-skriptet predict.py för att få en score [0,1].
 */
export class MLService {
  private python: string;
  private script: string;

  constructor(opts: MLServiceOptions = {}) {
    this.python = opts.pythonPath || "python3";
    this.script = opts.scriptPath ||
      path.resolve(__dirname, "../../src/ml/predict.py");
  }

  /**
   * Kör predict.py med JSON-features på stdin och returnerar float-score.
   */
  predict(features: Record<string, any>): number {
    const json = JSON.stringify(features);
    const proc = spawnSync(
      this.python,
      [this.script],
      {
        input: json,
        encoding: "utf-8",
      }
    );

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
