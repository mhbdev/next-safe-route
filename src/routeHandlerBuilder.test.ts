import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { ValidationIssue, createSafeRoute } from '.';

const paramsSchema = z.object({
  id: z.uuid(),
});

const querySchema = z.object({
  search: z.string().min(1),
});

const bodySchema = z.object({
  field: z.string(),
});

const transformedQuerySchema = z.object({
  page: z
    .union([z.number(), z.string()])
    .transform((value) => Number(value))
    .optional(),
});

const emptyParamsContext = { params: {} as Record<string, string | string[]> };

describe('params validation', () => {
  it('should validate and handle valid params', async () => {
    const GET = createSafeRoute()
      .params(paramsSchema)
      .handler((request, context) => {
        const { id } = context.params;
        return Response.json({ id }, { status: 200 });
      });

    const request = new Request('http://localhost/');
    const response = await GET(request, { params: { id: '550e8400-e29b-41d4-a716-446655440000' } });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ id: '550e8400-e29b-41d4-a716-446655440000' });
  });

  it('should resolve promise-based params (Next 16 compatibility)', async () => {
    const GET = createSafeRoute()
      .params(paramsSchema)
      .handler((request, context) => Response.json({ id: context.params.id }, { status: 200 }));

    const request = new Request('http://localhost/');
    const response = await GET(request, {
      params: Promise.resolve({ id: '550e8400-e29b-41d4-a716-446655440000' }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ id: '550e8400-e29b-41d4-a716-446655440000' });
  });

  it('should return an error for invalid params', async () => {
    const GET = createSafeRoute()
      .params(paramsSchema)
      .handler((request, context) => {
        const { id } = context.params;
        return Response.json({ id }, { status: 200 });
      });

    const request = new Request('http://localhost/');
    const response = await GET(request, { params: { id: 'invalid-uuid' } });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.message).toBe('Invalid params');
    expect(Array.isArray(data.issues)).toBe(true);
  });
});

describe('query validation', () => {
  it('should validate and handle valid query', async () => {
    const GET = createSafeRoute()
      .query(querySchema)
      .handler((request, context) => {
        const search = context.query.search;
        return Response.json({ search }, { status: 200 });
      });

    const request = new Request('http://localhost/?search=test');
    const response = await GET(request, emptyParamsContext);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ search: 'test' });
  });

  it('should return an error for invalid query', async () => {
    const GET = createSafeRoute()
      .query(querySchema)
      .handler((request, context) => {
        const search = context.query.search;
        return Response.json({ search }, { status: 200 });
      });

    const request = new Request('http://localhost/?search=');
    const response = await GET(request, emptyParamsContext);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.message).toBe('Invalid query');
    expect(Array.isArray(data.issues)).toBe(true);
  });

  it('should handle array query parameters', async () => {
    const arrayQuerySchema = z.object({
      tags: z.array(z.string()),
    });

    const GET = createSafeRoute()
      .query(arrayQuerySchema)
      .handler((request, context) => {
        return Response.json({ tags: context.query.tags }, { status: 200 });
      });

    const request = new Request('http://localhost/?tags=a&tags=b');
    const response = await GET(request, emptyParamsContext);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ tags: ['a', 'b'] });
  });

  it('should support always-array query strategy', async () => {
    const schema = z.object({
      tag: z.array(z.string()),
    });

    const GET = createSafeRoute({
      parserOptions: {
        query: {
          arrayStrategy: 'always',
        },
      },
    })
      .query(schema)
      .handler((request, context) => Response.json(context.query, { status: 200 }));

    const request = new Request('http://localhost/?tag=one');
    const response = await GET(request, emptyParamsContext);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ tag: ['one'] });
  });

  it('should support never-array query strategy', async () => {
    const schema = z.object({
      tag: z.string(),
    });

    const GET = createSafeRoute({
      parserOptions: {
        query: {
          arrayStrategy: 'never',
        },
      },
    })
      .query(schema)
      .handler((request, context) => Response.json(context.query, { status: 200 }));

    const request = new Request('http://localhost/?tag=one&tag=two');
    const response = await GET(request, emptyParamsContext);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ tag: 'two' });
  });

  it('should coerce query values when primitive coercion is enabled', async () => {
    const schema = z.object({
      page: z.number(),
      active: z.boolean(),
      nothing: z.null(),
    });

    const GET = createSafeRoute({
      parserOptions: {
        query: {
          coerce: 'primitive',
        },
      },
    })
      .query(schema)
      .handler((request, context) => Response.json(context.query, { status: 200 }));

    const request = new Request('http://localhost/?page=2&active=true&nothing=null');
    const response = await GET(request, emptyParamsContext);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ page: 2, active: true, nothing: null });
  });
});

describe('body validation', () => {
  it('should validate and handle valid body', async () => {
    const POST = createSafeRoute()
      .body(bodySchema)
      .handler((request, context) => {
        const field = context.body.field;
        return Response.json({ field }, { status: 200 });
      });

    const request = new Request('http://localhost/', {
      method: 'POST',
      body: JSON.stringify({ field: 'test-field' }),
      headers: { 'content-type': 'application/json' },
    });
    const response = await POST(request, emptyParamsContext);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ field: 'test-field' });
  });

  it('should return an error for invalid body', async () => {
    const POST = createSafeRoute()
      .body(bodySchema)
      .handler((request, context) => {
        const field = context.body.field;
        return Response.json({ field }, { status: 200 });
      });

    const request = new Request('http://localhost/', {
      method: 'POST',
      body: JSON.stringify({ field: 123 }),
      headers: { 'content-type': 'application/json' },
    });
    const response = await POST(request, emptyParamsContext);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.message).toBe('Invalid body');
    expect(Array.isArray(data.issues)).toBe(true);
  });
});

describe('combined validation', () => {
  it('should validate and handle valid request with params, query, and body', async () => {
    const POST = createSafeRoute()
      .params(paramsSchema)
      .query(querySchema)
      .body(bodySchema)
      .handler((request, context) => {
        const { id } = context.params;
        const { search } = context.query;
        const { field } = context.body;

        return Response.json({ id, search, field }, { status: 200 });
      });

    const request = new Request('http://localhost/?search=test', {
      method: 'POST',
      body: JSON.stringify({ field: 'test-field' }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request, { params: { id: '550e8400-e29b-41d4-a716-446655440000' } });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      id: '550e8400-e29b-41d4-a716-446655440000',
      search: 'test',
      field: 'test-field',
    });
  });

  it('should return an error for invalid params in combined validation', async () => {
    const POST = createSafeRoute()
      .params(paramsSchema)
      .query(querySchema)
      .body(bodySchema)
      .handler((request, context) => {
        const { id } = context.params;
        const { search } = context.query;
        const { field } = context.body;

        return Response.json({ id, search, field }, { status: 200 });
      });

    const request = new Request('http://localhost/?search=test', {
      method: 'POST',
      body: JSON.stringify({ field: 'test-field' }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request, { params: { id: 'invalid-uuid' } });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.message).toBe('Invalid params');
  });

  it('should return an error for invalid query in combined validation', async () => {
    const POST = createSafeRoute()
      .params(paramsSchema)
      .query(querySchema)
      .body(bodySchema)
      .handler((request, context) => {
        const { id } = context.params;
        const { search } = context.query;
        const { field } = context.body;

        return Response.json({ id, search, field }, { status: 200 });
      });

    const request = new Request('http://localhost/?search=', {
      method: 'POST',
      body: JSON.stringify({ field: 'test-field' }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request, { params: { id: '550e8400-e29b-41d4-a716-446655440000' } });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.message).toBe('Invalid query');
  });

  it('should return an error for invalid body in combined validation', async () => {
    const POST = createSafeRoute()
      .params(paramsSchema)
      .query(querySchema)
      .body(bodySchema)
      .handler((request, context) => {
        const { id } = context.params;
        const { search } = context.query;
        const { field } = context.body;

        return Response.json({ id, search, field }, { status: 200 });
      });

    const request = new Request('http://localhost/?search=test', {
      method: 'POST',
      body: JSON.stringify({ field: 123 }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request, { params: { id: '550e8400-e29b-41d4-a716-446655440000' } });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.message).toBe('Invalid body');
  });
});

describe('middlewares', () => {
  it('should execute middleware and add context properties', async () => {
    const middleware = async () => {
      return { user: { id: 'user-123', role: 'admin' } };
    };

    const GET = createSafeRoute()
      .use(middleware)
      .params(paramsSchema)
      .handler((request, context) => {
        const { id } = context.params;
        const { user } = context.data;

        return Response.json({ id, user }, { status: 200 });
      });

    const request = new Request('http://localhost/');
    const response = await GET(request, { params: { id: '550e8400-e29b-41d4-a716-446655440000' } });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      id: '550e8400-e29b-41d4-a716-446655440000',
      user: { id: 'user-123', role: 'admin' },
    });
  });

  it('should execute multiple middlewares and merge context properties', async () => {
    const middleware1 = async () => {
      return { user: { id: 'user-123' } };
    };

    const middleware2 = async () => {
      return { permissions: ['read', 'write'] };
    };

    const GET = createSafeRoute()
      .use(middleware1)
      .use(middleware2)
      .params(paramsSchema)
      .handler((request, context) => {
        const { id } = context.params;
        const { user, permissions } = context.data;

        return Response.json({ id, user, permissions }, { status: 200 });
      });

    const request = new Request('http://localhost/');
    const response = await GET(request, { params: { id: '550e8400-e29b-41d4-a716-446655440000' } });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      id: '550e8400-e29b-41d4-a716-446655440000',
      user: { id: 'user-123' },
      permissions: ['read', 'write'],
    });
  });

  it('should provide accumulated context data to middlewares', async () => {
    const GET = createSafeRoute({
      baseContext: {
        tenantId: 'tenant-1',
      },
    })
      .use((request, data) => {
        expect(data).toEqual({ tenantId: 'tenant-1' });
        return { user: { id: 'user-123' } };
      })
      .use((request, data) => {
        expect(data.tenantId).toBe('tenant-1');
        expect(data.user.id).toBe('user-123');
        return { requestId: 'req-1' };
      })
      .handler((request, context) => {
        return Response.json(context.data, { status: 200 });
      });

    const request = new Request('http://localhost/');
    const response = await GET(request, emptyParamsContext);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      tenantId: 'tenant-1',
      user: { id: 'user-123' },
      requestId: 'req-1',
    });
  });

  it('should support synchronous middleware return values', async () => {
    const GET = createSafeRoute()
      .use(() => ({ feature: 'enabled' }))
      .use((request, data) => ({ traceId: `${data.feature}-trace` }))
      .handler((request, context) => {
        return Response.json(context.data, { status: 200 });
      });

    const request = new Request('http://localhost/');
    const response = await GET(request, emptyParamsContext);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ feature: 'enabled', traceId: 'enabled-trace' });
  });

  it('should stop execution if synchronous middleware returns a Response', async () => {
    const middleware = () => {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    };

    const GET = createSafeRoute()
      .use(middleware)
      .handler(() => {
        return Response.json({ ok: true }, { status: 200 });
      });

    const request = new Request('http://localhost/');
    const response = await GET(request, emptyParamsContext);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data).toEqual({ error: 'Unauthorized' });
  });

  it('should stop execution if middleware returns a Response', async () => {
    const middleware = async () => {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    };

    const GET = createSafeRoute()
      .use(middleware)
      .handler(() => {
        return Response.json({ ok: true }, { status: 200 });
      });

    const request = new Request('http://localhost/');
    const response = await GET(request, emptyParamsContext);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data).toEqual({ error: 'Unauthorized' });
  });
});

describe('error handling', () => {
  it('should handle server errors using handleServerError method', async () => {
    class CustomError extends Error {
      constructor(message: string) {
        super(message);
        this.name = 'CustomError';
      }
    }
    const handleServerError = (error: Error) => {
      if (error instanceof CustomError) {
        return new Response(JSON.stringify({ message: error.name, details: error.message }), { status: 400 });
      }

      return new Response(JSON.stringify({ message: 'Something went wrong' }), { status: 400 });
    };

    const GET = createSafeRoute({
      handleServerError,
    })
      .params(paramsSchema)
      .handler(() => {
        throw new CustomError('Test error');
      });

    const request = new Request('http://localhost/');
    const response = await GET(request, { params: { id: '550e8400-e29b-41d4-a716-446655440000' } });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toEqual({ message: 'CustomError', details: 'Test error' });
  });

  it('should return a 500 error by default when the handler throws', async () => {
    const GET = createSafeRoute()
      .params(paramsSchema)
      .handler(() => {
        throw new Error('Boom');
      });

    const request = new Request('http://localhost/');
    const response = await GET(request, { params: { id: '550e8400-e29b-41d4-a716-446655440000' } });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.message).toBe('Internal server error');
  });
});

describe('body parsing', () => {
  it('should not parse the body when no body schema is provided', async () => {
    const POST = createSafeRoute().handler(() => {
      return Response.json({ ok: true }, { status: 200 });
    });

    const request = new Request('http://localhost/', {
      method: 'POST',
    });

    const response = await POST(request, emptyParamsContext);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
  });

  it('should keep default empty JSON body behavior when parser options are not configured', async () => {
    const POST = createSafeRoute()
      .body(z.object({}).strict())
      .handler((request, context) => {
        return Response.json({ body: context.body }, { status: 200 });
      });

    const request = new Request('http://localhost/', {
      method: 'POST',
      body: '',
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request, emptyParamsContext);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ body: {} });
  });

  it('should reject non-JSON bodies when a body schema is provided', async () => {
    const POST = createSafeRoute()
      .body(bodySchema)
      .handler((request, context) => {
        const field = context.body.field;
        return Response.json({ field }, { status: 200 });
      });

    const request = new Request('http://localhost/', {
      method: 'POST',
      body: 'plain-text-body',
      headers: { 'content-type': 'text/plain' },
    });

    const response = await POST(request, emptyParamsContext);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(response.status).toBe(400);
    expect(data.message).toBe(
      'Unsupported content type. Expected application/json, multipart/form-data, or application/x-www-form-urlencoded.',
    );
  });

  it('should parse and validate FormData body', async () => {
    const POST = createSafeRoute()
      .body(bodySchema)
      .handler((request, context) => {
        const field = context.body.field;
        return Response.json({ field }, { status: 200 });
      });

    const formData = new FormData();
    formData.append('field', 'form-field-value');

    const request = new Request('http://localhost/', {
      method: 'POST',
      body: formData,
    });

    const response = await POST(request, emptyParamsContext);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ field: 'form-field-value' });
  });

  it('should coerce FormData body values when primitive coercion is enabled', async () => {
    const schema = z.object({
      count: z.number(),
      enabled: z.boolean(),
    });

    const POST = createSafeRoute({
      parserOptions: {
        body: {
          coerce: 'primitive',
        },
      },
    })
      .body(schema)
      .handler((request, context) => Response.json(context.body, { status: 200 }));

    const formData = new FormData();
    formData.append('count', '2');
    formData.append('enabled', 'true');

    const request = new Request('http://localhost/', {
      method: 'POST',
      body: formData,
    });

    const response = await POST(request, emptyParamsContext);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ count: 2, enabled: true });
  });

  it('should support body array strategy for FormData', async () => {
    const schema = z.object({
      tag: z.array(z.string()),
    });

    const POST = createSafeRoute({
      parserOptions: {
        body: {
          arrayStrategy: 'always',
        },
      },
    })
      .body(schema)
      .handler((request, context) => Response.json(context.body, { status: 200 }));

    const formData = new FormData();
    formData.append('tag', 'one');

    const request = new Request('http://localhost/', {
      method: 'POST',
      body: formData,
    });

    const response = await POST(request, emptyParamsContext);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ tag: ['one'] });
  });

  it('should support non-strict body parsing with JSON fallback', async () => {
    const POST = createSafeRoute({
      parserOptions: {
        body: {
          strictContentType: false,
        },
      },
    })
      .body(bodySchema)
      .handler((request, context) => Response.json(context.body, { status: 200 }));

    const request = new Request('http://localhost/', {
      method: 'POST',
      body: JSON.stringify({ field: 'text-json' }),
      headers: { 'content-type': 'text/plain' },
    });

    const response = await POST(request, emptyParamsContext);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ field: 'text-json' });
  });

  it('should support text fallback for non-strict body parsing', async () => {
    const POST = createSafeRoute({
      parserOptions: {
        body: {
          strictContentType: false,
          fallbackStrategy: 'text',
        },
      },
    })
      .body(z.string())
      .handler((request, context) => Response.json({ value: context.body }, { status: 200 }));

    const request = new Request('http://localhost/', {
      method: 'POST',
      body: 'raw-text',
      headers: { 'content-type': 'text/plain' },
    });

    const response = await POST(request, emptyParamsContext);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ value: 'raw-text' });
  });

  it('should reject empty JSON body when allowEmptyBody is false', async () => {
    const POST = createSafeRoute({
      parserOptions: {
        body: {
          allowEmptyBody: false,
        },
      },
    })
      .body(bodySchema)
      .handler((request, context) => Response.json(context.body, { status: 200 }));

    const request = new Request('http://localhost/', {
      method: 'POST',
      body: '',
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request, emptyParamsContext);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.message).toBe('Request body is required.');
  });

  it('should use configured empty body value', async () => {
    const POST = createSafeRoute({
      parserOptions: {
        body: {
          emptyValue: null,
        },
      },
    })
      .body(z.null())
      .handler((request, context) => Response.json({ value: context.body }, { status: 200 }));

    const request = new Request('http://localhost/', {
      method: 'POST',
      body: '',
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request, emptyParamsContext);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ value: null });
  });
});

describe('schema transformations', () => {
  it('should return transformed values from validation', async () => {
    const GET = createSafeRoute()
      .query(transformedQuerySchema)
      .handler((request, context) => {
        return Response.json(context.query, { status: 200 });
      });

    const request = new Request('http://localhost/?page=2');
    const response = await GET(request, emptyParamsContext);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.page).toBe(2);
    expect(typeof data.page).toBe('number');
  });
});

describe('custom validation error handler', () => {
  it('should use custom validation error handler when provided', async () => {
    const validationErrorHandler = (issues: ValidationIssue[]) => {
      return new Response(
        JSON.stringify({
          error: 'Validation Failed',
          details: issues.map((i) => ({ path: i.path, message: i.message })),
        }),
        { status: 422 },
      );
    };

    const POST = createSafeRoute({
      validationErrorHandler,
    })
      .body(bodySchema)
      .handler(() => {
        return Response.json({ ok: true }, { status: 200 });
      });

    const request = new Request('http://localhost/', {
      method: 'POST',
      body: JSON.stringify({ field: 123 }), // Invalid type
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request, emptyParamsContext);
    const data = await response.json();

    expect(response.status).toBe(422);
    expect(data.error).toBe('Validation Failed');
    expect(Array.isArray(data.details)).toBe(true);
  });
});
