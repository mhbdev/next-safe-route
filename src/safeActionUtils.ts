import type { ValidationIssue } from './adapters/types';
import type {
  NormalizeValidationIssuesFn,
  SafeActionResult,
  SafeActionValidationErrorResult,
  SafeActionValidationErrors,
} from './safeActionTypes';

function toDotPath(path?: Array<string | number | symbol>) {
  if (!path || path.length === 0) {
    return undefined;
  }

  return path.map((part) => (typeof part === 'symbol' ? part.description ?? part.toString() : String(part))).join('.');
}

export const normalizeValidationIssues: NormalizeValidationIssuesFn = (issues) => {
  const fieldErrors: Record<string, string[]> = {};
  const formErrors: string[] = [];

  for (const issue of issues) {
    const path = toDotPath(issue.path);

    if (!path) {
      formErrors.push(issue.message);
      continue;
    }

    if (!fieldErrors[path]) {
      fieldErrors[path] = [];
    }

    const messages = fieldErrors[path] ?? [];
    messages.push(issue.message);
    fieldErrors[path] = messages;
  }

  return {
    fieldErrors,
    formErrors,
  };
};

export function createValidationErrorResult(issues: ValidationIssue[]): SafeActionValidationErrorResult {
  return {
    validationErrors: normalizeValidationIssues(issues),
  };
}

export function createServerErrorResult<TData = never>(serverError: string): SafeActionResult<TData> {
  return {
    serverError,
  };
}

export function isSafeActionResult<TData>(value: unknown): value is SafeActionResult<TData> {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<SafeActionResult<TData>>;
  return 'data' in candidate || 'validationErrors' in candidate || 'serverError' in candidate;
}

export function mergeContexts<TContext extends Record<string, unknown>, TPatch extends Record<string, unknown>>(
  base: TContext,
  patch?: TPatch,
): TContext & TPatch {
  return {
    ...base,
    ...(patch ?? {}),
  } as TContext & TPatch;
}

export function isValidationFailure(
  result: SafeActionResult<unknown>,
): result is { validationErrors: SafeActionValidationErrors } {
  return Boolean(result && typeof result === 'object' && 'validationErrors' in result && result.validationErrors);
}
