import { zodAdapter } from './adapters/zod';
import { SafeActionBuilder } from './safeActionBuilder';
import type { SafeActionClientOptions } from './safeActionTypes';

const DEFAULT_SERVER_ERROR = 'Something went wrong while executing the action.';

export function createSafeActionClient<TContext extends Record<string, unknown> = Record<string, unknown>>(
  options?: SafeActionClientOptions<TContext>,
) {
  return new SafeActionBuilder({
    validationAdapter: options?.validationAdapter ?? zodAdapter(),
    baseContext: (options?.baseContext ?? {}) as TContext,
    metadata: {} as Record<string, never>,
    middlewares: [],
    defaultServerError: options?.defaultServerError ?? DEFAULT_SERVER_ERROR,
    handleServerError: options?.handleServerError,
  });
}
