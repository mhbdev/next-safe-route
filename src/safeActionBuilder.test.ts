import { describe, expect, expectTypeOf, it } from 'vitest';
import { z } from 'zod';

import { createSafeActionClient } from './createSafeActionClient';

describe('safe action client', () => {
  it('creates client and executes success path', async () => {
    const actionClient = createSafeActionClient();

    const greetAction = actionClient
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

    const result = await greetAction({ name: 'John Doe' });

    expect(result).toEqual({
      data: {
        message: 'Hello, John Doe!',
      },
    });
  });

  it('returns normalized validation errors for input failure', async () => {
    const actionClient = createSafeActionClient();

    const action = actionClient
      .inputSchema(
        z.object({
          users: z.array(
            z.object({
              name: z.string().min(3),
            }),
          ),
        }),
      )
      .action(async () => {
        return { ok: true };
      });

    const result = await action({
      users: [{ name: 'a' }],
    });

    expect(result.data).toBeUndefined();
    expect(result.validationErrors).toBeDefined();
    expect(result.validationErrors?.fieldErrors['users.0.name']).toBeDefined();
    expect(result.validationErrors?.formErrors).toEqual([]);
  });

  it('returns form errors when issue path is empty', async () => {
    const actionClient = createSafeActionClient();

    const action = actionClient.inputSchema(z.string().min(2)).action(async () => {
      return { ok: true };
    });

    const result = await action('a');

    expect(result.validationErrors?.formErrors.length).toBeGreaterThan(0);
  });

  it('merges middleware context patches via next', async () => {
    const actionClient = createSafeActionClient({
      baseContext: {
        tenantId: 'tenant-1',
      },
    });

    const action = actionClient
      .inputSchema(
        z.object({
          value: z.string(),
        }),
      )
      .use<{ userId: string }>(async ({ next }) => {
        return next({
          ctx: {
            userId: 'user-1',
          },
        });
      })
      .action(async ({ parsedInput, ctx }) => {
        return {
          value: parsedInput.value,
          tenantId: ctx.tenantId,
          userId: ctx.userId,
        };
      });

    const result = await action({
      value: 'hello',
    });

    expect(result).toEqual({
      data: {
        value: 'hello',
        tenantId: 'tenant-1',
        userId: 'user-1',
      },
    });
  });

  it('supports middleware short-circuit without next', async () => {
    const actionClient = createSafeActionClient();

    const action = actionClient
      .inputSchema(z.object({}))
      .use(async () => {
        return {
          serverError: 'Blocked by middleware',
        };
      })
      .action(async () => {
        return {
          ok: true,
        };
      });

    const result = await action({});
    expect(result).toEqual({
      serverError: 'Blocked by middleware',
    });
  });

  it('maps double next() call to safe server error', async () => {
    const actionClient = createSafeActionClient({
      defaultServerError: 'Safe error',
    });

    const action = actionClient
      .inputSchema(z.object({}))
      .use(async ({ next }) => {
        const first = await next();
        await next();
        return first;
      })
      .action(async () => {
        return {
          ok: true,
        };
      });

    const result = await action({});
    expect(result).toEqual({
      serverError: 'Safe error',
    });
  });

  it('exposes metadata in middleware and handler', async () => {
    const actionClient = createSafeActionClient().metadata({
      role: 'admin' as const,
    });

    const action = actionClient
      .inputSchema(z.object({}))
      .use(async ({ metadata, next }) => {
        expect(metadata.role).toBe('admin');
        return next();
      })
      .action(async ({ metadata }) => {
        return {
          role: metadata.role,
        };
      });

    const result = await action({});
    expect(result).toEqual({
      data: {
        role: 'admin',
      },
    });
  });

  it('validates output with output schema', async () => {
    const actionClient = createSafeActionClient();

    const action = actionClient
      .inputSchema(z.object({}))
      .outputSchema(
        z.object({
          count: z.number(),
        }),
      )
      .action(async () => {
        return {
          count: 2,
        };
      });

    const result = await action({});

    expect(result).toEqual({
      data: {
        count: 2,
      },
    });
  });

  it('maps output validation failure to safe server error', async () => {
    const actionClient = createSafeActionClient({
      defaultServerError: 'Output failed',
    });

    const action = actionClient
      .inputSchema(z.object({}))
      .outputSchema(
        z.object({
          count: z.number(),
        }),
      )
      .action(async () => {
        return {
          count: 'invalid',
        };
      });

    const result = await action({});

    expect(result).toEqual({
      serverError: 'Output failed',
    });
  });

  it('maps thrown errors with custom handler', async () => {
    const actionClient = createSafeActionClient({
      defaultServerError: 'Fallback error',
      handleServerError: (error) => {
        if (error instanceof Error) {
          return `Handled: ${error.message}`;
        }
        return 'Handled unknown';
      },
    });

    const action = actionClient.inputSchema(z.object({})).action(async () => {
      throw new Error('Boom');
    });

    const result = await action({});

    expect(result).toEqual({
      serverError: 'Handled: Boom',
    });
  });

  it('uses default server error when no custom handler is set', async () => {
    const actionClient = createSafeActionClient({
      defaultServerError: 'Default safe error',
    });

    const action = actionClient.inputSchema(z.object({})).action(async () => {
      throw new Error('Boom');
    });

    const result = await action({});

    expect(result).toEqual({
      serverError: 'Default safe error',
    });
  });
});

describe('safe action types', () => {
  it('uses schema output type for parsedInput and schema input type for action args', () => {
    const action = createSafeActionClient()
      .inputSchema(
        z.object({
          page: z.string().transform((value) => Number(value)),
        }),
      )
      .action(({ parsedInput }) => {
        expectTypeOf(parsedInput.page).toEqualTypeOf<number>();
        return {
          page: parsedInput.page,
        };
      });

    expectTypeOf(action).parameters.toEqualTypeOf<[{ page: string }]>();
  });

  it('preserves middleware context augmentation across use chain', () => {
    createSafeActionClient()
      .inputSchema(
        z.object({
          name: z.string(),
        }),
      )
      .use<{ userId: string }>(async ({ next }) => {
        return next({
          ctx: {
            userId: 'user-1',
          },
        });
      })
      .action(({ ctx }) => {
        expectTypeOf(ctx.userId).toEqualTypeOf<string>();
        return {
          ok: true,
        };
      });
  });
});
