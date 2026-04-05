// ============================================================
// zen-cli  —  Dangerous Command Interceptor
// ============================================================
// Intercepts and blocks destructive shell commands before execution,
// protecting production environments from accidental damage.

import path from 'node:path';
import type { PermissionSettings } from '../types.js';

const DANGEROUS_COMMAND_PATTERNS = [
  /\brm\s+(-rf?|--recursive)\s+\/\s*$/i,
  /\brm\s+(-rf?|--recursive)\s+\/\s*\S/i,
  /\bmkfs\b/i,
  /\bdd\s+of=/i,
  /\bshred\b/i,
  /\b:\(\)\{\s*:\|:\s*&\s*\}\s*;/,
  /\bfork\s*bomb/i,
  /\bsudo\s+rm\b/i,
  /\bchmod\s+-?777\s+\/\s*$/i,
  /\bchown\s+-R\s+\S+\s+\/\s*$/i,
  /\bmv\s+\/\s/i,
  /\b>\s*\/etc\/passwd/i,
  /\b>\s*\/etc\/shadow/i,
  /\b>\s*\/etc\/sudoers/i,
  /\b>\s*\/dev\/sda/i,
  /\b>\s*\/dev\/nvme/i,
  /\b>\s*\/dev\/hd/i,
  /\bcurl\s+\S+\s*\|\s*(ba)?sh/i,
  /\bwget\s+\S+\s*-O\s*-\s*\|\s*(ba)?sh/i,
  /\b(npx|npm)\s+exec\s+.*\|\s*(ba)?sh/i,
  /\bgit\s+push\s+--force\b/i,
  /\bgit\s+reset\s+--hard\b/i,
  /\bgit\s+clean\s+-fdx?\b/i,
  /\bdrop\s+database\b/i,
  /\bDROP\s+TABLE\b/i,
  /\btruncate\s+table\b/i,
  /\bshutdown\s+-r?\b/i,
  /\breboot\b/i,
  /\bpkill\s+-9?\s/i,
  /\bkillall\s/i,
  /\bsystemctl\s+(stop|disable)\b/i,
];

export interface DangerousCommandCheck {
  isDangerous: boolean;
  reason: string;
  severity: 'critical' | 'high' | 'medium';
}

export function checkDangerousCommand(command: string, extraPatterns: string[] = []): DangerousCommandCheck {
  const normalized = command.trim().replace(/\s+/g, ' ');

  const allPatterns = [
    ...DANGEROUS_COMMAND_PATTERNS,
    ...extraPatterns.map(p => {
      try {
        return new RegExp(p, 'i');
      } catch {
        return null;
      }
    }).filter((p): p is RegExp => p !== null),
  ];

  for (const pattern of allPatterns) {
    if (pattern.test(normalized)) {
      const patternStr = pattern.source;
      let severity: 'critical' | 'high' | 'medium' = 'high';
      let reason = `Dangerous command pattern detected: "${patternStr}"`;

      if (/rm\s+(-rf?).*\/\s*$/i.test(normalized) || /mkfs/i.test(normalized) || /dd\s+of=/i.test(normalized)) {
        severity = 'critical';
        reason = `CRITICAL: Destructive command detected: "${patternStr}" — this could cause irreversible data loss`;
      } else if (/curl.*\|.*sh/i.test(normalized) || /wget.*\|.*sh/i.test(normalized)) {
        severity = 'critical';
        reason = `CRITICAL: Remote code execution pattern detected: "${patternStr}" — piping remote scripts to shell is unsafe`;
      } else if (/shutdown|reboot/i.test(normalized)) {
        severity = 'critical';
        reason = `CRITICAL: System shutdown/reboot command blocked: "${patternStr}"`;
      }

      return { isDangerous: true, reason, severity };
    }
  }

  return { isDangerous: false, reason: '', severity: 'medium' };
}

export function enhancePermissionSettingsWithDangerousCommands(
  settings: PermissionSettings,
  extraPatterns: string[] = [],
): PermissionSettings {
  const allDangerous = [
    ...settings.deniedCommands,
    'rm -rf /*',
    'rm -rf /',
    'sudo rm -rf *',
    'mkfs.*',
    'dd of=*',
    'curl * | sh',
    'curl * | bash',
    'wget * -O - | sh',
    'wget * -O - | bash',
    'git push --force*',
    'git reset --hard*',
    'git clean -fd*',
    ...extraPatterns,
  ];

  const seen = new Set<string>();
  const unique = allDangerous.filter(cmd => {
    if (seen.has(cmd)) return false;
    seen.add(cmd);
    return true;
  });

  return {
    ...settings,
    deniedCommands: unique,
  };
}
