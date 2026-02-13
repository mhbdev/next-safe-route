import { useCallback, useState, useTransition } from 'react';

import type { SafeActionResult, SafeActionValidationErrors } from '../safeActionTypes';

type AnyAction = (...args: never[]) => Promise<SafeActionResult<unknown>>;

type ActionResult<TAction extends AnyAction> = Awaited<ReturnType<TAction>>;

type ActionData<TAction extends AnyAction> =
  ActionResult<TAction> extends SafeActionResult<infer TData> ? TData : never;

export type SafeActionStatus = 'idle' | 'executing' | 'success' | 'validation-error' | 'server-error';

export type UseActionOptions<TAction extends AnyAction> = {
  onSuccess?: (data: ActionData<TAction>) => void;
  onValidationError?: (validationErrors: SafeActionValidationErrors) => void;
  onServerError?: (serverError: string) => void;
  onSettled?: (result: ActionResult<TAction>) => void;
};

function getStatusFromResult(result: SafeActionResult<unknown>): SafeActionStatus {
  if ('data' in result) {
    return 'success';
  }

  if ('validationErrors' in result) {
    return 'validation-error';
  }

  return 'server-error';
}

export function useAction<TAction extends AnyAction>(action: TAction, options?: UseActionOptions<TAction>) {
  const [result, setResult] = useState<ActionResult<TAction> | undefined>(undefined);
  const [status, setStatus] = useState<SafeActionStatus>('idle');
  const [hasExecuted, setHasExecuted] = useState(false);
  const [isPending, startTransition] = useTransition();

  const executeAsync = useCallback(
    async (...args: Parameters<TAction>): Promise<ActionResult<TAction>> => {
      setStatus('executing');
      setHasExecuted(true);

      const actionResult = (await action(...args)) as ActionResult<TAction>;
      setResult(actionResult);

      const nextStatus = getStatusFromResult(actionResult as SafeActionResult<unknown>);
      setStatus(nextStatus);

      if ('data' in actionResult) {
        options?.onSuccess?.(actionResult.data as ActionData<TAction>);
      } else if ('validationErrors' in actionResult) {
        const validationErrors = actionResult.validationErrors;
        if (validationErrors) {
          options?.onValidationError?.(validationErrors);
        }
      } else if ('serverError' in actionResult) {
        options?.onServerError?.(actionResult.serverError);
      }

      options?.onSettled?.(actionResult);
      return actionResult;
    },
    [action, options],
  );

  const execute = useCallback(
    (...args: Parameters<TAction>) => {
      startTransition(() => {
        void executeAsync(...args);
      });
    },
    [executeAsync, startTransition],
  );

  const reset = useCallback(() => {
    setStatus('idle');
    setResult(undefined);
    setHasExecuted(false);
  }, []);

  return {
    execute,
    executeAsync,
    result,
    status,
    isPending,
    hasExecuted,
    reset,
  };
}
