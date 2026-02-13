/* @vitest-environment jsdom */
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { z } from 'zod';

import { createSafeActionClient } from '../createSafeActionClient';
import type { SafeActionResult } from '../safeActionTypes';
import { useAction } from './useAction';
import { useOptimisticAction } from './useOptimisticAction';
import { useStateAction } from './useStateAction';

describe('action hooks', () => {
  it('useAction transitions state and supports reset', async () => {
    const action = createSafeActionClient()
      .inputSchema(
        z.object({
          name: z.string(),
        }),
      )
      .action(async ({ parsedInput }) => {
        return {
          message: `Hello, ${parsedInput.name}!`,
        };
      });

    const { result } = renderHook(() => useAction(action));

    expect(result.current.status).toBe('idle');
    expect(result.current.hasExecuted).toBe(false);

    await act(async () => {
      await result.current.executeAsync({
        name: 'John Doe',
      });
    });

    expect(result.current.status).toBe('success');
    expect(result.current.hasExecuted).toBe(true);
    expect(result.current.result).toEqual({
      data: {
        message: 'Hello, John Doe!',
      },
    });

    act(() => {
      result.current.reset();
    });

    expect(result.current.status).toBe('idle');
    expect(result.current.hasExecuted).toBe(false);
    expect(result.current.result).toBeUndefined();
  });

  it('useAction execute triggers async state update', async () => {
    const action = createSafeActionClient()
      .inputSchema(
        z.object({
          value: z.string(),
        }),
      )
      .action(async ({ parsedInput }) => {
        return {
          value: parsedInput.value.toUpperCase(),
        };
      });

    const { result } = renderHook(() => useAction(action));

    act(() => {
      result.current.execute({
        value: 'abc',
      });
    });

    await waitFor(() => {
      expect(result.current.status).toBe('success');
    });

    expect(result.current.result).toEqual({
      data: {
        value: 'ABC',
      },
    });
  });

  it('useOptimisticAction applies optimistic state and keeps it on success', async () => {
    const action = createSafeActionClient()
      .inputSchema(
        z.object({
          delta: z.number(),
        }),
      )
      .action(async ({ parsedInput }) => {
        await new Promise((resolve) => setTimeout(resolve, 25));
        return {
          total: parsedInput.delta,
        };
      });

    const { result } = renderHook(() =>
      useOptimisticAction(action, {
        initialState: 0,
        updateFn: (current, input) => current + input.delta,
      }),
    );

    act(() => {
      result.current.execute({
        delta: 2,
      });
    });

    expect(result.current.optimisticState).toBe(2);

    await waitFor(() => {
      expect(result.current.status).toBe('success');
    });

    expect(result.current.optimisticState).toBe(2);
  });

  it('useOptimisticAction reverts optimistic state on server failure', async () => {
    const action = createSafeActionClient()
      .inputSchema(
        z.object({
          delta: z.number(),
        }),
      )
      .use(async () => {
        return {
          serverError: 'Denied',
        };
      })
      .action(async ({ parsedInput }) => {
        return {
          total: parsedInput.delta,
        };
      });

    const { result } = renderHook(() =>
      useOptimisticAction(action, {
        initialState: 5,
        updateFn: (current, input) => current + input.delta,
      }),
    );

    act(() => {
      result.current.execute({
        delta: 3,
      });
    });

    expect(result.current.optimisticState).toBe(8);

    await waitFor(() => {
      expect(result.current.status).toBe('server-error');
    });

    expect(result.current.optimisticState).toBe(5);
  });

  it('useStateAction supports formAction mapping and state updates', async () => {
    const action = createSafeActionClient()
      .inputSchema(
        z.object({
          name: z.string().min(1),
        }),
      )
      .action(async ({ parsedInput }) => {
        return {
          message: `Hello, ${parsedInput.name}!`,
        };
      });

    const { result } = renderHook(() =>
      useStateAction(action, {
        initialState: {
          message: '',
        },
        onSuccess: (prevState, data) => ({
          ...prevState,
          message: data.message,
        }),
      }),
    );

    const formData = new FormData();
    formData.set('name', 'Jane');

    await act(async () => {
      await result.current.formAction(formData);
    });

    expect(result.current.status).toBe('success');
    expect(result.current.state).toEqual({
      message: 'Hello, Jane!',
    });
  });

  it('useStateAction updates state from validation/server callbacks', async () => {
    const action = createSafeActionClient()
      .inputSchema(
        z.object({
          name: z.string().min(2),
        }),
      )
      .action(async () => {
        throw new Error('Unexpected');
      });

    const { result } = renderHook(() =>
      useStateAction(action, {
        initialState: {
          error: '',
        },
        onValidationError: (prevState, validationErrors) => ({
          ...prevState,
          error: validationErrors.formErrors[0] ?? validationErrors.fieldErrors.name?.[0] ?? 'Validation failed',
        }),
        onServerError: (prevState, serverError) => ({
          ...prevState,
          error: serverError,
        }),
      }),
    );

    await act(async () => {
      await result.current.executeAsync({
        name: 'a',
      });
    });

    expect(result.current.status).toBe('validation-error');
    expect(result.current.state.error.length).toBeGreaterThan(0);

    await act(async () => {
      await result.current.executeAsync({
        name: 'valid',
      });
    });

    expect(result.current.status).toBe('server-error');
    expect(result.current.state.error.length).toBeGreaterThan(0);
  });
});

describe('action hooks types', () => {
  it('infers input and result types from action', () => {
    const action = createSafeActionClient()
      .inputSchema(
        z.object({
          name: z.string(),
        }),
      )
      .action(async ({ parsedInput }) => {
        return {
          message: parsedInput.name,
        };
      });

    const { result } = renderHook(() => useAction(action));

    const executeAsync: (input: { name: string }) => Promise<SafeActionResult<{ message: string }>> =
      result.current.executeAsync;
    expectTypeOf(executeAsync).toBeFunction();
  });
});
