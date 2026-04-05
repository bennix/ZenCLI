// ============================================================
// zen-cli  —  Command Failure Analyzer & Retry Helper
// ============================================================
// Analyzes command failure output, suggests fixes, and tracks
// retry attempts so the AI can auto-retry up to 3 times with
// different strategies before informing the user.

export interface FailureAnalysis {
  category: FailureCategory;
  summary: string;
  suggestions: string[];
  severity: 'info' | 'warning' | 'error';
}

export type FailureCategory =
  | 'missing-dependency'
  | 'file-not-found'
  | 'permission-denied'
  | 'syntax-error'
  | 'missing-font'
  | 'timeout'
  | 'out-of-memory'
  | 'network-error'
  | 'unknown';

const FAILURE_PATTERNS: Array<{
  pattern: RegExp;
  category: FailureCategory;
  summary: string;
  suggestions: string[];
}> = [
  {
    pattern: /(?:command not found|not found|No such file or directory|ENOENT|cannot find|not installed)/i,
    category: 'missing-dependency',
    summary: 'Required command or file not found',
    suggestions: [
      'Check if the tool is installed: which <command>',
      'Install via package manager: brew install, apt install, npm install, pip install, etc.',
      'Verify PATH includes the tool location: echo $PATH',
    ],
  },
  {
    pattern: /(?:Permission denied|EACCES|EPERM|Operation not permitted)/i,
    category: 'permission-denied',
    summary: 'Permission denied',
    suggestions: [
      'Check file permissions: ls -la <file>',
      'Make script executable: chmod +x <file>',
      'Verify ownership: chown <user> <file>',
    ],
  },
  {
    pattern: /(?:fontspec|font .* not found|cannot find font|font .* undefined|fontenc|font .* missing)/i,
    category: 'missing-font',
    summary: 'Missing font in LaTeX/XeLaTeX compilation',
    suggestions: [
      'Install the missing font via tlmgr: tlmgr install <font-package>',
      'List available fonts: fc-list | grep -i <font-name>',
      'Use a fallback font in the document preamble: \\setmainfont{AvailableFont}',
      'Install common font packages: tlmgr install collection-fontsrecommended',
    ],
  },
  {
    pattern: /(?:LaTeX Error|! LaTeX|! Package|Undefined control sequence|Missing \$ inserted|Overfull|Underfull|! Emergency stop)/i,
    category: 'syntax-error',
    summary: 'LaTeX compilation error',
    suggestions: [
      'Check the .log file for the exact line number of the error',
      'Verify all \\begin{...} have matching \\end{...}',
      'Check for missing packages in the preamble',
      'Try compiling with -interaction=nonstopmode to see all errors',
      'Use pdflatex instead of xelatex if font issues persist',
    ],
  },
  {
    pattern: /(?:Killed|Out of memory|Cannot allocate memory|ENOMEM|java\.lang\.OutOfMemoryError)/i,
    category: 'out-of-memory',
    summary: 'Out of memory',
    suggestions: [
      'Close other memory-intensive applications',
      'Increase swap space if available',
      'Process smaller input files or batch the work',
    ],
  },
  {
    pattern: /(?:Connection refused|Network is unreachable|Connection timed out|ETIMEDOUT|ECONNREFUSED|DNS|resolve)/i,
    category: 'network-error',
    summary: 'Network error',
    suggestions: [
      'Check network connectivity: ping <host>',
      'Verify proxy settings if behind a firewall',
      'Try with a different network or VPN',
    ],
  },
];

export function analyzeFailure(output: string): FailureAnalysis {
  const normalizedOutput = output.replace(/\r\n/g, '\n');

  for (const { pattern, category, summary, suggestions } of FAILURE_PATTERNS) {
    if (pattern.test(normalizedOutput)) {
      return { category, summary, suggestions, severity: 'error' };
    }
  }

  if (/exit code \d+/.test(normalizedOutput)) {
    return {
      category: 'unknown',
      summary: 'Command failed with non-zero exit code',
      suggestions: [
        'Review the error output above for specific failure details',
        'Try running the command with verbose/debug flags (-v, --verbose, --debug)',
        'Check if input files or prerequisites exist and are valid',
      ],
      severity: 'warning',
    };
  }

  return {
    category: 'unknown',
    summary: 'Command failed',
    suggestions: [
      'Review the error output for specific failure details',
      'Try running with verbose flags to get more diagnostic information',
      'Check prerequisites, input files, and environment setup',
    ],
    severity: 'info',
  };
}

export function formatRetryHint(
  attempt: number,
  maxAttempts: number,
  output: string,
): string {
  const analysis = analyzeFailure(output);
  const remaining = maxAttempts - attempt;

  const header = `[Command failed — attempt ${attempt}/${maxAttempts}. ${remaining > 0 ? remaining + ' attempt(s) remaining' : 'All attempts exhausted'}]`;

  const lines = [
    header,
    `Category: ${analysis.summary}`,
    '',
    'Suggested fixes:',
    ...analysis.suggestions.map((s, i) => `  ${i + 1}. ${s}`),
    '',
    'Try a different approach before the next attempt.',
  ];

  return lines.join('\n');
}
