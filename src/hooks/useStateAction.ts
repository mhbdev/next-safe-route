import { useCallback, useState } from 'react';

import type { SafeActionResult, SafeActionValidationErrors } from '../safeActionTypes';
import { useAction } from './useAction';

type AnyAction = (...args: never[]) => Promise<SafeActionResult<unknown>>;

type ActionResult<TAction extends AnyAction> = Awaited<ReturnType<TAction>>;

type ActionInput<TAction extends AnyAction> = Parameters<TAction> extends [] ? void : Parameters<TAction>[0];

type ActionData<TAction extends AnyAction> =
  ActionResult<TAction> extends SafeActionResult<infer TData> ? TData : never;

export type UseStateActionOptions<TAction extends AnyAction, TState> = {
  initialState: TState;
  mapFormData?: (formData: FormData) => ActionInput<TAction>;
  onSuccess?: (prevState: TState, data: ActionData<TAction>) => TState;
  onValidationError?: (prevState: TState, validationErrors: SafeActionValidationErrors) => TState;
  onServerError?: (prevState: TState, serverError: string) => TState;
  onSettled?: (result: ActionResult<TAction>) => void;
};

export function useStateAction<TAction extends AnyAction, TState>(
  action: TAction,
  options: UseStateActionOptions<TAction, TState>,
) {
  const [state, setState] = useState(options.initialState);

  const actionState = useAction(action, {
    onSuccess: (data) => {
      if (options.onSuccess) {
        setState((prevState) => options.onSuccess!(prevState, data as ActionData<TAction>));
      }
    },
    onValidationError: (validationErrors) => {
      if (options.onValidationError) {
        setState((prevState) => options.onValidationError!(prevState, validationErrors));
      }
    },
    onServerError: (serverError) => {
      if (options.onServerError) {
        setState((prevState) => options.onServerError!(prevState, serverError));
      }
    },
    onSettled: (result) => {
      options.onSettled?.(result as ActionResult<TAction>);
    },
  });

  const formAction = useCallback(
    async (formData: FormData) => {
      const mapper =
        options.mapFormData ??
        ((value: FormData) => Object.fromEntries(value.entries()) as unknown as ActionInput<TAction>);
      const mappedInput = mapper(formData);
      return (actionState.executeAsync as (...args: unknown[]) => Promise<ActionResult<TAction>>)(mappedInput);
    },
    [actionState, options],
  );

  const reset = useCallback(() => {
    setState(options.initialState);
    actionState.reset();
  }, [actionState, options.initialState]);

  return {
    formAction,
    execute: actionState.execute,
    executeAsync: actionState.executeAsync,
    result: actionState.result,
    status: actionState.status,
    isPending: actionState.isPending,
    hasExecuted: actionState.hasExecuted,
    reset,
    state,
  };
}
