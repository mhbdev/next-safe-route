---
name: next-safe-route
description: Use @mhbdev/next-safe-route to implement Next.js App Router route handlers with type-safe params/query/body validation, middleware context composition, and predictable error handling. Trigger this skill when an agent needs to create or modify route handlers, choose between zod/valibot/yup schemas, or enforce request validation behavior.
license: MIT
compatibility: Next.js App Router Route Handlers (Next.js 15/16), Node.js >=18, TypeScript. Not for Pages Router API routes.
metadata:
  package: "@mhbdev/next-safe-route"
  npm: "https://www.npmjs.com/package/@mhbdev/next-safe-route"
  repository: "https://github.com/mhbdev/next-safe-route"
---

# @mhbdev/next-safe-route

Use this skill to generate correct route-handler code that uses this package idiomatically.

## Capabilities

- Build route handlers with `createSafeRoute()` and chained `.params()`, `.query()`, `.body()`, `.use()`, `.handler()`.
- Preserve strong typing in `context.params`, `context.query`, `context.body`, and `context.data`.
- Configure validation adapters:
  - Default: zod via main package import
  - Optional: valibot via `@mhbdev/next-safe-route/valibot`
  - Optional: yup via `@mhbdev/next-safe-route/yup`
- Customize failures with:
  - `validationErrorHandler` for schema errors
  - `handleServerError` for unexpected exceptions

## Required Inputs

Collect these before generating code:

1. HTTP method and route path.
2. Validation library (`zod`, `valibot`, or `yup`).
3. Expected schema for `params`, `query`, and `body`.
4. Desired validation/server error response shape.
5. Middleware-derived context fields needed in `context.data`.
6. Parser behavior overrides (query/body array strategy, coercion, strictness, empty-body rules).

## Decision Table

Need | Use
--- | ---
Only zod is required | `createSafeRoute()` with default adapter
valibot schemas | `createSafeRoute({ validationAdapter: valibotAdapter() })`
yup schemas | `createSafeRoute({ validationAdapter: yupAdapter() })`
Custom schema error payload/status | `validationErrorHandler`
Custom unexpected-error payload/status | `handleServerError`
Auth or request-derived shared data | `.use(async (request, data) => ({ ... }))`
Control query/body parsing behavior | `createSafeRoute({ parserOptions: { query: ..., body: ... } })`

## Workflow

1. Define schemas for `params`, `query`, and/or `body`.
2. Create builder with `createSafeRoute(...)`.
3. Chain `.params()`, `.query()`, `.body()` only for inputs that should be validated.
4. Add `.use()` middleware for typed context enrichment.
5. Implement `.handler((request, context) => Response)`.
6. Return explicit `Response`/`Response.json(...)`.

## Middleware Writing Notes

- Write middleware as `.use(async (request, data) => ({ ...contextFields }))`.
- Return `Response` from middleware to short-circuit the chain (for auth failures or early exits).
- Return plain serializable objects for context fields; avoid relying on prototype methods.
- Assume merge order is left-to-right:
  - Later middleware keys override earlier middleware keys.
  - Middleware fields are available in `context.data` only.
- Keep middleware focused on cross-cutting concerns:
  - Authentication and authorization
  - Tenant and organization resolution
  - Correlation/request IDs
  - Feature flags
- Avoid consuming request body in middleware when route body validation is used, because request streams are single-read.
- Keep middleware deterministic and side-effect-light; prefer throwing only for truly exceptional failures and use `Response` for expected denials.

### Middleware Pattern

```ts
import { createSafeRoute } from '@mhbdev/next-safe-route';

export const GET = createSafeRoute()
  .use(async (request, data) => {
    const auth = request.headers.get('authorization');
    if (!auth) {
      return Response.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const user = await resolveUserFromAuth(auth);
    if (!user) {
      return Response.json({ message: 'Forbidden' }, { status: 403 });
    }

    return { user };
  })
  .use(async (request, data) => ({ requestId: crypto.randomUUID() }))
  .handler((request, context) => {
    return Response.json({
      requestId: context.data.requestId,
      userId: context.data.user.id,
    });
  });
```

## Behavioral Contract

- Validation order is `params` -> `query` -> `body`.
- Default validation errors: HTTP `400`, JSON body with `message` and `issues`.
- Default unhandled errors: HTTP `500`, JSON `{ "message": "Internal server error" }`.
- If `.body()` is configured, accepted content types are:
  - `application/json`
  - `multipart/form-data`
  - `application/x-www-form-urlencoded`
- Default parser behavior uses scalar-or-array auto mode: repeated query/body form keys become arrays, single keys become scalars.
- Parser behavior can be overridden with `parserOptions` (`arrayStrategy`, `coerce`, `strictContentType`, `allowEmptyBody`, `emptyValue`).
- Supports Next.js 16 async params (`context.params` may be a Promise).

## Constraints and Gotchas

- Use for **App Router Route Handlers**; do not generate Pages Router `NextApiRequest/NextApiResponse` patterns with this package.
- If no `.body()` schema is provided, do not rely on parsed request body in handler logic.
- Optional adapters (`valibot`, `yup`) require those packages installed in the consumer project.

## Reference Patterns

### Zod default

```ts
import { createSafeRoute } from '@mhbdev/next-safe-route';
import { z } from 'zod';

export const POST = createSafeRoute()
  .params(z.object({ id: z.uuid() }))
  .query(z.object({ search: z.string().optional() }))
  .body(z.object({ title: z.string().min(1) }))
  .handler((request, context) => {
    return Response.json({
      id: context.params.id,
      search: context.query.search,
      title: context.body.title,
    });
  });
```

### Valibot adapter

```ts
import { createSafeRoute } from '@mhbdev/next-safe-route';
import { valibotAdapter } from '@mhbdev/next-safe-route/valibot';
import { object, string } from 'valibot';

export const GET = createSafeRoute({
  validationAdapter: valibotAdapter(),
})
  .query(object({ q: string() }))
  .handler((request, context) => Response.json({ q: context.query.q }));
```
