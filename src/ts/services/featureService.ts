// src/ts/services/featureService.ts

import { spawnSync } from "child_process";
import path from "path";

export interface FeatureServiceOptions {
  pythonPath?: string;  // Exempel: "python3"
  scriptPath?: string;  // Exempel: path.resolve(..., "src/ml/extract.py")
}

/**
 * FeatureService anropar Python-scriptet extract.py
 * för att omvandla ett pool-init-event till ett features-dict.
 */
export class FeatureService {
  private python: string;
  private script: string;

  constructor(opts: FeatureServiceOptions = {}) {
    this.python = opts.pythonPath || "python3";
    this.script = opts.scriptPath || path.resolve(__dirname, "../../src/ml/extract.py");
  }

  /**
   * Kör extract.py med event-JSON på stdin och returnerar parsed JSON.
   */
  extract(event: Record<string, any>): Record<string, any> {
    const input = JSON.stringify(event);
    const proc = spawnSync(
      this.python,
      [this.script],
      { input, encoding: "utf-8" }
    );

    if (proc.error) {
      throw proc.error;
    }
    if (proc.status !== 0) {
      throw new Error(`FeatureService failed: ${proc.stderr}`);
    }

    try {
      return JSON.parse(proc.stdout);
    } catch (e) {
      throw new Error(`Invalid JSON from feature script: ${proc.stdout}`);
    }
  }
}
