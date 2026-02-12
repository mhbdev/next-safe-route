import { Infer, Schema, ValidationIssue } from './adapters/types';

type Awaitable<T> = T | Promise<T>;

export type ValueCoercionMode = 'none' | 'primitive';

export type ValueCoercionFn = (value: string, key: string) => unknown;

export type ValueCoercion = ValueCoercionMode | ValueCoercionFn;

export type QueryArrayStrategy = 'auto' | 'always' | 'never';

export type QuerySingleValueStrategy = 'first' | 'last';

export type QueryParserOptions = {
  arrayStrategy?: QueryArrayStrategy;
  singleValueStrategy?: QuerySingleValueStrategy;
  coerce?: ValueCoercion;
};

export type BodyFallbackStrategy = 'json-first' | 'text';

export type BodyParserOptions = {
  strictContentType?: boolean;
  allowEmptyBody?: boolean;
  emptyValue?: unknown;
  coerce?: ValueCoercion;
  fallbackStrategy?: BodyFallbackStrategy;
  arrayStrategy?: QueryArrayStrategy;
  singleValueStrategy?: QuerySingleValueStrategy;
};

export type ParserOptions = {
  query?: QueryParserOptions;
  body?: BodyParserOptions;
};

export type InferMaybe<TSchema extends Schema | undefined> = TSchema extends Schema
  ? Infer<TSchema>
  : Record<string, unknown>;

export type RouteContext<TRawParams extends Record<string, unknown> = Record<string, string | string[]>> = {
  params: Awaitable<TRawParams>;
};

export type HandlerFunction<TParams, TQuery, TBody, TContext> = (
  request: Request,
  context: { params: TParams; query: TQuery; body: TBody; data: TContext },
) => Response | Promise<Response>;

export type OriginalRouteHandler = (request: Request, context: RouteContext) => Response | Promise<Response>;

export type HandlerServerErrorFn = (error: Error) => Response;

export type ValidationErrorHandler = (issues: ValidationIssue[]) => Response;
