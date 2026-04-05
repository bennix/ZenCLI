// ============================================================
// zen-cli  —  Audit Logger
// ============================================================
// Records all AI-executed terminal commands with timestamps
// to a local log file for post-hoc investigation.

import fs from 'node:fs';
import path from 'node:path';

export interface AuditLogEntry {
  timestamp: string;
  command: string;
  cwd: string;
  success: boolean;
  exitCode: string;
  toolName: string;
}

class AuditLogger {
  private logFilePath: string;
  private enabled: boolean;

  constructor(enabled: boolean, logFile?: string) {
    this.enabled = enabled;
    this.logFilePath = logFile || path.join(process.cwd(), '.zen-cli', 'audit.log');
  }

  log(entry: Omit<AuditLogEntry, 'timestamp'>): void {
    if (!this.enabled) return;

    const fullEntry: AuditLogEntry = {
      ...entry,
      timestamp: new Date().toISOString(),
    };

    const dir = path.dirname(this.logFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const line = JSON.stringify(fullEntry) + '\n';
    fs.appendFileSync(this.logFilePath, line, 'utf-8');
  }

  getLogFilePath(): string {
    return this.logFilePath;
  }

  isEnabled(): boolean {
    return this.enabled;
  }
}

let instance: AuditLogger | null = null;

export function initAuditLogger(enabled: boolean, logFile?: string): AuditLogger {
  instance = new AuditLogger(enabled, logFile);
  return instance;
}

export function getAuditLogger(): AuditLogger {
  if (!instance) {
    instance = new AuditLogger(false);
  }
  return instance;
}
