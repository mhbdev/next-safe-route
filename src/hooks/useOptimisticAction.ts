import { useCallback, useRef, useState, useTransition } from 'react';

import type { SafeActionResult } from '../safeActionTypes';
import { type UseActionOptions, useAction } from './useAction';

type AnyAction = (...args: never[]) => Promise<SafeActionResult<unknown>>;

type ActionResult<TAction extends AnyAction> = Awaited<ReturnType<TAction>>;

type ActionInput<TAction extends AnyAction> = Parameters<TAction> extends [] ? void : Parameters<TAction>[0];

type ActionData<TAction extends AnyAction> =
  ActionResult<TAction> extends SafeActionResult<infer TData> ? TData : never;

export type UseOptimisticActionOptions<TAction extends AnyAction, TOptimisticState> = UseActionOptions<TAction> & {
  initialState: TOptimisticState;
  updateFn: (currentState: TOptimisticState, input: ActionInput<TAction>) => TOptimisticState;
  preserveOnError?: boolean;
};

export function useOptimisticAction<TAction extends AnyAction, TOptimisticState>(
  action: TAction,
  options: UseOptimisticActionOptions<TAction, TOptimisticState>,
) {
  const [optimisticState, setOptimisticState] = useState(options.initialState);
  const optimisticStateRef = useRef(options.initialState);
  const rollbackStateRef = useRef<TOptimisticState | undefined>(undefined);
  const [isPendingTransition, startTransition] = useTransition();

  const actionState = useAction(action, {
    ...options,
    onSuccess: (data) => {
      rollbackStateRef.current = undefined;
      options.onSuccess?.(data as ActionData<TAction>);
    },
    onValidationError: (validationErrors) => {
      if (!options.preserveOnError && rollbackStateRef.current !== undefined) {
        optimisticStateRef.current = rollbackStateRef.current;
        setOptimisticState(rollbackStateRef.current);
      }
      rollbackStateRef.current = undefined;
      options.onValidationError?.(validationErrors);
    },
    onServerError: (serverError) => {
      if (!options.preserveOnError && rollbackStateRef.current !== undefined) {
        optimisticStateRef.current = rollbackStateRef.current;
        setOptimisticState(rollbackStateRef.current);
      }
      rollbackStateRef.current = undefined;
      options.onServerError?.(serverError);
    },
    onSettled: (result) => {
      options.onSettled?.(result as ActionResult<TAction>);
    },
  });

  const executeAsync = useCallback(
    async (...args: Parameters<TAction>): Promise<ActionResult<TAction>> => {
      const input = args[0] as ActionInput<TAction>;
      rollbackStateRef.current = optimisticStateRef.current;

      const nextOptimisticState = options.updateFn(optimisticStateRef.current, input);
      optimisticStateRef.current = nextOptimisticState;
      setOptimisticState(nextOptimisticState);

      return (await actionState.executeAsync(...args)) as ActionResult<TAction>;
    },
    [actionState, options],
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
    optimisticStateRef.current = options.initialState;
    rollbackStateRef.current = undefined;
    setOptimisticState(options.initialState);
    actionState.reset();
  }, [actionState, options.initialState]);

  return {
    execute,
    executeAsync,
    result: actionState.result,
    status: actionState.status,
    isPending: actionState.isPending || isPendingTransition,
    hasExecuted: actionState.hasExecuted,
    reset,
    optimisticState,
  };
}
