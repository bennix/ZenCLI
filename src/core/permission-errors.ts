const PERMISSION_MESSAGE_RE = /\b(permission denied|operation not permitted|access is denied|not permitted)\b/i;

function getMacOsPermissionHint(): string {
  return process.platform === 'darwin'
    ? ' On macOS, protected folders may also require reopening the folder through the app or granting Files & Folders / Full Disk Access in System Settings.'
    : '';
}

export function isPermissionError(error: unknown): boolean {
  const value = error as NodeJS.ErrnoException | undefined;
  if (!value) return false;

  return value.code === 'EACCES'
    || value.code === 'EPERM'
    || PERMISSION_MESSAGE_RE.test(String(value.message || ''));
}

export function containsPermissionDeniedText(value: string): boolean {
  return PERMISSION_MESSAGE_RE.test(String(value || ''));
}

export function formatPermissionError(options: {
  operation: string;
  target?: string;
  advice?: string;
  detail?: string;
}): string {
  const target = options.target ? `: ${options.target}` : '';
  const advice = options.advice || 'Use a file or folder you can access, or adjust ownership and permissions.';
  let message = `Permission denied while trying to ${options.operation}${target}. ${advice}${getMacOsPermissionHint()}`.trim();

  if (options.detail && options.detail.trim() && !PERMISSION_MESSAGE_RE.test(options.detail)) {
    message += `\n\nDetails:\n${options.detail.trim()}`;
  }

  return message;
}
