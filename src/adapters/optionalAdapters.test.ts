import type { GenericSchema } from 'valibot';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

afterEach(() => {
  vi.doUnmock('valibot');
  vi.doUnmock('yup');
  vi.resetModules();
  vi.clearAllMocks();
});

describe('optional adapters', () => {
  it('supports zod-only usage without loading optional adapters', async () => {
    vi.resetModules();
    vi.doMock('valibot', () => {
      throw new Error('MODULE_NOT_FOUND');
    });
    vi.doMock('yup', () => {
      throw new Error('MODULE_NOT_FOUND');
    });

    const { createSafeRoute } = await import('..');

    const GET = createSafeRoute()
      .query(z.object({ search: z.string() }))
      .handler((request, context) => Response.json({ search: context.query.search }, { status: 200 }));

    const response = await GET(new Request('http://localhost/?search=test'), { params: {} });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ search: 'test' });
  });

  it('throws a friendly error when valibot is not installed', async () => {
    vi.resetModules();
    vi.doMock('valibot', () => {
      throw new Error('MODULE_NOT_FOUND');
    });

    const { valibotAdapter } = await import('./valibot');
    const adapter = valibotAdapter();

    await expect(adapter.validate({} as GenericSchema, {})).rejects.toThrowError(
      'valibotAdapter requires optional peer dependency "valibot". Install it with `npm install valibot`.',
    );
  });

  it('validates using valibot when installed', async () => {
    vi.resetModules();
    const { valibotAdapter } = await import('./valibot');
    const { object: valibotObject, string: valibotString } = await import('valibot');
    const adapter = valibotAdapter();
    const schema = valibotObject({
      name: valibotString(),
    });

    const success = await adapter.validate(schema, { name: 'next-safe-route' });
    expect(success).toEqual({ success: true, data: { name: 'next-safe-route' } });

    const failure = await adapter.validate(schema, { name: 123 });
    expect(failure.success).toBe(false);
    if (failure.success === false) {
      expect(failure.issues[0]?.path?.[0]).toBe('name');
    }
  });

  it('validates using yup when installed', async () => {
    vi.resetModules();
    const { yupAdapter } = await import('./yup');
    const yup = await import('yup');
    const adapter = yupAdapter();
    const schema = yup.object({
      id: yup.string().uuid().required(),
    });

    const success = await adapter.validate(schema, { id: '550e8400-e29b-41d4-a716-446655440000' });
    expect(success).toEqual({ success: true, data: { id: '550e8400-e29b-41d4-a716-446655440000' } });

    const failure = await adapter.validate(schema, { id: 'not-a-uuid' });
    expect(failure.success).toBe(false);
    if (failure.success === false) {
      expect(failure.issues[0]?.path?.[0]).toBe('id');
    }
  });
});
