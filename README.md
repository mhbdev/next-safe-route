<h1 align="center">@mhbdev/next-safe-route</h1>

<p align="center">
  <a href="https://www.npmjs.com/package/@mhbdev/next-safe-route"><img src="https://img.shields.io/npm/v/%40mhbdev%2Fnext-safe-route?style=for-the-badge&logo=npm" /></a>
  <a href="https://github.com/richardsolomou/next-safe-route/actions/workflows/test.yaml"><img src="https://img.shields.io/github/actions/workflow/status/richardsolomou/next-safe-route/test.yaml?style=for-the-badge&logo=vitest" /></a>
  <a href="https://github.com/richardsolomou/next-safe-route/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/%40mhbdev%2Fnext-safe-route?style=for-the-badge" /></a>
</p>

`next-safe-route` is a utility library for Next.js that provides type-safety and schema validation for [Route Handlers](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)/API Routes. It is compatible with Next.js 15+ (including 16) route handler signatures.

## Features

- **✅ Schema Validation:** Automatically validate request parameters, query strings, and body content with built-in JSON error responses.
- **🧷 Type-Safe:** Work with full TypeScript type safety for parameters, query strings, and body content, including transformation results.
- **🔗 Adapter-Friendly:** Ships with a zod (v4+) adapter by default and lazily loads optional adapters for valibot and yup.
- **📦 Next-Ready:** Matches the Next.js Route Handler signature (including Next 15/16) and supports middleware-style context extensions.
- **🧪 Fully Tested:** Extensive test suite to ensure everything works reliably.

## Installation

```sh
npm install @mhbdev/next-safe-route zod
```

The library uses [zod](https://zod.dev) v4+ by default. Adapters for [valibot](https://valibot.dev) and [yup](https://github.com/jquense/yup) are optional and lazy-loaded. Install them only if you plan to use them:

```sh
# valibot
npm install valibot

# yup
npm install yup
```

If an optional adapter is invoked without its peer dependency installed, a clear error message will explain what to install.

## Usage

```ts
// app/api/hello/route.ts
import { createSafeRoute } from '@mhbdev/next-safe-route';
import { z } from 'zod';

const paramsSchema = z.object({
  id: z.string(),
});

const querySchema = z.object({
  search: z.string().optional(),
});

const bodySchema = z.object({
  field: z.string(),
});

export const GET = createSafeRoute()
  .params(paramsSchema)
  .query(querySchema)
  .body(bodySchema)
  .handler((request, context) => {
    const { id } = context.params;
    const { search } = context.query;
    const { field } = context.body;

    return Response.json({ id, search, field }, { status: 200 });
  });
```

To define a route handler in Next.js:

1. Import `createSafeRoute` and your validation library (e.g., `zod`).
2. Define validation schemas for params, query, and body as needed.
3. Use `createSafeRoute()` to create a route handler, chaining `params`, `query`, and `body` methods.
4. Implement your handler function, accessing validated and type-safe params, query, and body through `context`. Body validation supports `application/json`, `multipart/form-data`, and `application/x-www-form-urlencoded`.

### Middleware context

Middlewares receive both the incoming request and the accumulated `context.data` from `baseContext` and previous middlewares. Middlewares can return either a context object or a `Response` (synchronously or asynchronously) to short-circuit execution.

```ts
const GET = createSafeRoute({
  baseContext: { tenantId: 'tenant-1' },
})
  .use((request, data) => {
    if (!request.headers.get('authorization')) {
      return Response.json({ message: 'Unauthorized' }, { status: 401 });
    }
    return { userId: 'user-123', tenantId: data.tenantId };
  })
  .handler((request, context) => {
    return Response.json(context.data);
  });
```

### Parser options

You can customize query/body parsing behavior with `parserOptions`:

- `parserOptions.query.arrayStrategy`: `'auto' | 'always' | 'never'` (default: `'auto'`)
- `parserOptions.query.coerce`: `'none' | 'primitive' | ((value, key) => unknown)` (default: `'none'`)
- `parserOptions.body.strictContentType`: `boolean` (default: `true`)
- `parserOptions.body.allowEmptyBody`: `boolean` (default: `true`)
- `parserOptions.body.emptyValue`: value used when empty body is allowed (default: `{}`)
- `parserOptions.body.coerce`: `'none' | 'primitive' | ((value, key) => unknown)` for form/text values

```ts
const POST = createSafeRoute({
  parserOptions: {
    query: {
      arrayStrategy: 'always',
      coerce: 'primitive',
    },
    body: {
      strictContentType: false,
      allowEmptyBody: false,
      coerce: 'primitive',
    },
  },
})
  .query(z.object({ page: z.array(z.number()) }))
  .body(z.object({ count: z.number() }))
  .handler((request, context) => {
    return Response.json({ query: context.query, body: context.body });
  });
```

### Using other validation libraries

The package exports adapters so you can bring your own schema library. Optional adapters can be imported from the main entry or their own subpaths to avoid pulling in unused code:

```ts
import { createSafeRoute } from '@mhbdev/next-safe-route';
import { valibotAdapter } from '@mhbdev/next-safe-route/valibot';
import { object, string } from 'valibot';

const querySchema = object({
  search: string(),
});

export const GET = createSafeRoute({
  validationAdapter: valibotAdapter(),
})
  .query(querySchema)
  .handler((request, context) => {
    return Response.json({ search: context.query.search });
  });
```

## Tests

Tests are written using [Vitest](https://vitest.dev). To run the tests, use the following command:

```sh
pnpm test
```

## Contributing

Contributions are welcome! For major changes, please open an issue first to discuss what you would like to change.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
