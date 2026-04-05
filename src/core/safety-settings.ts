// ============================================================
// zen-cli  —  Safety Settings Defaults & Normalization
// ============================================================

import type { SafetySettings } from '../types.js';

export function createDefaultSafetySettings(): SafetySettings {
  return {
    auditLog: {
      enabled: true,
    },
    dangerousCommands: {
      enabled: true,
      extraPatterns: [],
    },
    sensitiveFiles: {
      enabled: true,
      patterns: [],
    },
    autoFormat: {
      enabled: false,
      command: '',
      runAfterFileChanges: true,
    },
    autoTest: {
      enabled: false,
      command: '',
      runAfterFileChanges: true,
      maxOutputChars: 10000,
    },
    prGate: {
      enabled: false,
      testCommand: '',
    },
    autoCommit: {
      enabled: false,
      messageTemplate: 'chore: AI-assisted changes',
      onTurnEnd: false,
    },
  };
}

export function normalizeSafetySettings(value: Partial<SafetySettings> | undefined): SafetySettings {
  const defaults = createDefaultSafetySettings();
  return {
    auditLog: {
      ...defaults.auditLog,
      ...(value?.auditLog || {}),
    },
    dangerousCommands: {
      ...defaults.dangerousCommands,
      ...(value?.dangerousCommands || {}),
      extraPatterns: Array.isArray(value?.dangerousCommands?.extraPatterns)
        ? value.dangerousCommands.extraPatterns.filter((p: string) => typeof p === 'string' && p.trim().length > 0)
        : defaults.dangerousCommands.extraPatterns,
    },
    sensitiveFiles: {
      ...defaults.sensitiveFiles,
      ...(value?.sensitiveFiles || {}),
      patterns: Array.isArray(value?.sensitiveFiles?.patterns)
        ? value.sensitiveFiles.patterns.filter((p: string) => typeof p === 'string' && p.trim().length > 0)
        : defaults.sensitiveFiles.patterns,
    },
    autoFormat: {
      ...defaults.autoFormat,
      ...(value?.autoFormat || {}),
    },
    autoTest: {
      ...defaults.autoTest,
      ...(value?.autoTest || {}),
    },
    prGate: {
      ...defaults.prGate,
      ...(value?.prGate || {}),
    },
    autoCommit: {
      ...defaults.autoCommit,
      ...(value?.autoCommit || {}),
    },
  };
}
