import { Schema, ValidationAdapter, ValidationIssue } from './adapters/types';
import { zodAdapter } from './adapters/zod';
import {
  BodyFallbackStrategy,
  HandlerFunction,
  HandlerServerErrorFn,
  InferMaybe,
  OriginalRouteHandler,
  ParserOptions,
  QueryArrayStrategy,
  QuerySingleValueStrategy,
  RouteContext,
  ValidationErrorHandler,
  ValueCoercion,
} from './types';

type Awaitable<T> = T | Promise<T>;

type Middleware<
  TContext extends Record<string, unknown> = Record<string, unknown>,
  TReturn extends Record<string, unknown> = Record<string, unknown>,
> = (request: Request, data: TContext) => Awaitable<TReturn | Response>;

type AnyMiddleware = Middleware<Record<string, unknown>, Record<string, unknown>>;

type NormalizedParserOptions = {
  query: {
    arrayStrategy: QueryArrayStrategy;
    singleValueStrategy: QuerySingleValueStrategy;
    coerce: ValueCoercion;
  };
  body: {
    strictContentType: boolean;
    allowEmptyBody: boolean;
    hasEmptyValue: boolean;
    emptyValue: unknown;
    coerce: ValueCoercion;
    fallbackStrategy: BodyFallbackStrategy;
    arrayStrategy: QueryArrayStrategy;
    singleValueStrategy: QuerySingleValueStrategy;
  };
};

function normalizeParserOptions(parserOptions?: ParserOptions): NormalizedParserOptions {
  const bodyOptions = parserOptions?.body;

  return {
    query: {
      arrayStrategy: parserOptions?.query?.arrayStrategy ?? 'auto',
      singleValueStrategy: parserOptions?.query?.singleValueStrategy ?? 'last',
      coerce: parserOptions?.query?.coerce ?? 'none',
    },
    body: {
      strictContentType: bodyOptions?.strictContentType ?? true,
      allowEmptyBody: bodyOptions?.allowEmptyBody ?? true,
      hasEmptyValue: Boolean(bodyOptions && 'emptyValue' in bodyOptions),
      emptyValue: bodyOptions?.emptyValue,
      coerce: bodyOptions?.coerce ?? 'none',
      fallbackStrategy: bodyOptions?.fallbackStrategy ?? 'json-first',
      arrayStrategy: bodyOptions?.arrayStrategy ?? 'auto',
      singleValueStrategy: bodyOptions?.singleValueStrategy ?? 'last',
    },
  };
}

type BuilderConfig<
  TParams extends Schema | undefined,
  TQuery extends Schema | undefined,
  TBody extends Schema | undefined,
> = {
  paramsSchema: TParams;
  querySchema: TQuery;
  bodySchema: TBody;
};

class BodyParsingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BodyParsingError';
  }
}

export class RouteHandlerBuilder<
  TParams extends Schema | undefined = undefined,
  TQuery extends Schema | undefined = undefined,
  TBody extends Schema | undefined = undefined,
  TContext extends Record<string, unknown> = Record<string, unknown>,
> {
  private config: BuilderConfig<TParams, TQuery, TBody>;
  private middlewares: AnyMiddleware[];
  private handleServerError?: HandlerServerErrorFn;
  private validationErrorHandler?: ValidationErrorHandler;
  private validationAdapter: ValidationAdapter;
  private baseContext: TContext;
  private parserOptions: NormalizedParserOptions;
  private parserOptionsInput?: ParserOptions;

  constructor({
    config = {
      paramsSchema: undefined as TParams,
      querySchema: undefined as TQuery,
      bodySchema: undefined as TBody,
    },
    validationAdapter = zodAdapter(),
    middlewares = [],
    handleServerError,
    validationErrorHandler,
    baseContext,
    parserOptions,
  }: {
    config?: BuilderConfig<TParams, TQuery, TBody>;
    middlewares?: AnyMiddleware[];
    handleServerError?: HandlerServerErrorFn;
    validationErrorHandler?: ValidationErrorHandler;
    validationAdapter?: ValidationAdapter;
    baseContext?: TContext;
    parserOptions?: ParserOptions;
  }) {
    this.config = config;
    this.middlewares = middlewares;
    this.handleServerError = handleServerError;
    this.validationErrorHandler = validationErrorHandler;
    this.validationAdapter = validationAdapter;
    this.baseContext = (baseContext ?? {}) as TContext;
    this.parserOptionsInput = parserOptions;
    this.parserOptions = normalizeParserOptions(parserOptions);
  }

  params<T extends Schema>(schema: T): RouteHandlerBuilder<T, TQuery, TBody, TContext> {
    return new RouteHandlerBuilder<T, TQuery, TBody, TContext>({
      config: { ...this.config, paramsSchema: schema },
      middlewares: this.middlewares,
      handleServerError: this.handleServerError,
      validationErrorHandler: this.validationErrorHandler,
      validationAdapter: this.validationAdapter,
      baseContext: this.baseContext,
      parserOptions: this.parserOptionsInput,
    });
  }

  query<T extends Schema>(schema: T): RouteHandlerBuilder<TParams, T, TBody, TContext> {
    return new RouteHandlerBuilder<TParams, T, TBody, TContext>({
      config: { ...this.config, querySchema: schema },
      middlewares: this.middlewares,
      handleServerError: this.handleServerError,
      validationErrorHandler: this.validationErrorHandler,
      validationAdapter: this.validationAdapter,
      baseContext: this.baseContext,
      parserOptions: this.parserOptionsInput,
    });
  }

  body<T extends Schema>(schema: T): RouteHandlerBuilder<TParams, TQuery, T, TContext> {
    return new RouteHandlerBuilder<TParams, TQuery, T, TContext>({
      config: { ...this.config, bodySchema: schema },
      middlewares: this.middlewares,
      handleServerError: this.handleServerError,
      validationErrorHandler: this.validationErrorHandler,
      validationAdapter: this.validationAdapter,
      baseContext: this.baseContext,
      parserOptions: this.parserOptionsInput,
    });
  }

  use<TReturnType extends Record<string, unknown>>(middleware: Middleware<TContext, TReturnType>) {
    return new RouteHandlerBuilder<TParams, TQuery, TBody, TContext & TReturnType>({
      config: this.config,
      middlewares: [...this.middlewares, middleware as unknown as AnyMiddleware],
      handleServerError: this.handleServerError,
      validationErrorHandler: this.validationErrorHandler,
      validationAdapter: this.validationAdapter,
      baseContext: this.baseContext as unknown as TContext & TReturnType,
      parserOptions: this.parserOptionsInput,
    });
  }

  handler(
    handler: HandlerFunction<InferMaybe<TParams>, InferMaybe<TQuery>, InferMaybe<TBody>, TContext>,
  ): OriginalRouteHandler {
    return async (request, context): Promise<Response> => {
      try {
        const routeContext = context ?? ({ params: {} } as RouteContext);
        const paramsInput = await this.resolveParams(routeContext.params);
        const queryInput = this.getQueryParams(request);
        const bodyInput = await this.parseRequestBody(request);

        const paramsValidation = await this.validateInput(this.config.paramsSchema, paramsInput, 'Invalid params');
        if (paramsValidation.success === false) {
          return paramsValidation.response;
        }

        const queryValidation = await this.validateInput(this.config.querySchema, queryInput, 'Invalid query');
        if (queryValidation.success === false) {
          return queryValidation.response;
        }

        const bodyValidation = await this.validateInput(this.config.bodySchema, bodyInput, 'Invalid body');
        if (bodyValidation.success === false) {
          return bodyValidation.response;
        }

        let middlewareContext: TContext = { ...this.baseContext };
        for (const middleware of this.middlewares) {
          const result = await middleware(request, middlewareContext);
          if (result instanceof Response) {
            return result;
          }
          middlewareContext = { ...middlewareContext, ...(result as TContext) };
        }

        return handler(request, {
          params: paramsValidation.data,
          query: queryValidation.data,
          body: bodyValidation.data,
          data: middlewareContext,
        });
      } catch (error) {
        if (error instanceof BodyParsingError) {
          return this.buildErrorResponse(error.message, undefined, 400);
        }

        if (this.handleServerError) {
          return this.handleServerError(error as Error);
        }

        return this.buildErrorResponse('Internal server error', undefined, 500);
      }
    };
  }

  private async resolveParams(params: RouteContext['params'] | undefined) {
    const resolvedParams = await Promise.resolve(params ?? {});
    return (resolvedParams ?? {}) as Record<string, unknown>;
  }

  private async validateInput<S extends Schema | undefined>(
    schema: S,
    data: unknown,
    errorMessage: string,
  ): Promise<{ success: true; data: InferMaybe<S> } | { success: false; response: Response }> {
    if (!schema) {
      return { success: true, data: (data ?? {}) as InferMaybe<S> };
    }

    const result = await this.validationAdapter.validate(schema, data);
    if (result.success === true) {
      return { success: true, data: result.data as InferMaybe<S> };
    }

    if (this.validationErrorHandler) {
      return { success: false, response: this.validationErrorHandler(result.issues) };
    }

    return { success: false, response: this.buildErrorResponse(errorMessage, result.issues) };
  }

  private getQueryParams(request: Request) {
    const url = new URL(request.url);
    const params: Record<string, unknown> = {};
    const keys = Array.from(new Set(url.searchParams.keys()));
    const { arrayStrategy, singleValueStrategy, coerce } = this.parserOptions.query;

    for (const key of keys) {
      const values = url.searchParams.getAll(key);
      const coercedValues = values.map((value) => this.coerceStringValue(value, key, coerce));
      params[key] = this.selectValues(coercedValues, arrayStrategy, singleValueStrategy);
    }

    return params;
  }

  private selectValues(
    values: unknown[],
    arrayStrategy: QueryArrayStrategy,
    singleValueStrategy: QuerySingleValueStrategy,
  ): unknown {
    if (arrayStrategy === 'always') {
      return values;
    }

    if (arrayStrategy === 'never') {
      return this.pickSingleValue(values, singleValueStrategy);
    }

    return values.length === 1 ? values[0] : values;
  }

  private pickSingleValue(values: unknown[], strategy: QuerySingleValueStrategy): unknown {
    if (values.length === 0) {
      return undefined;
    }

    return strategy === 'first' ? values[0] : values[values.length - 1];
  }

  private coerceStringValue(value: string, key: string, coercion: ValueCoercion): unknown {
    if (typeof coercion === 'function') {
      return coercion(value, key);
    }

    if (coercion === 'primitive') {
      return this.coercePrimitiveValue(value);
    }

    return value;
  }

  private coercePrimitiveValue(value: string): unknown {
    const trimmed = value.trim();

    if (trimmed === 'true') {
      return true;
    }

    if (trimmed === 'false') {
      return false;
    }

    if (trimmed === 'null') {
      return null;
    }

    if (/^-?(?:\d+|\d*\.\d+)$/.test(trimmed)) {
      return Number(trimmed);
    }

    return value;
  }

  private parseFormData(
    formData: FormData,
    arrayStrategy: QueryArrayStrategy,
    singleValueStrategy: QuerySingleValueStrategy,
    coercion: ValueCoercion,
  ): Record<string, unknown> {
    const data: Record<string, unknown> = {};
    const keys = Array.from(new Set(formData.keys()));

    for (const key of keys) {
      const values = formData
        .getAll(key)
        .map((value) => (typeof value === 'string' ? this.coerceStringValue(value, key, coercion) : value));
      data[key] = this.selectValues(values, arrayStrategy, singleValueStrategy);
    }

    return data;
  }

  private resolveEmptyBody() {
    const { allowEmptyBody, hasEmptyValue, emptyValue } = this.parserOptions.body;

    if (allowEmptyBody) {
      return hasEmptyValue ? emptyValue : {};
    }

    throw new BodyParsingError('Request body is required.');
  }

  private async parseRequestBody(request: Request): Promise<unknown> {
    if (!this.config.bodySchema) {
      return {};
    }

    const contentType = (request.headers.get('content-type') ?? '').toLowerCase();

    if (contentType.includes('application/json')) {
      const rawBody = await request.text();

      if (rawBody.length === 0) {
        return this.resolveEmptyBody();
      }

      try {
        return JSON.parse(rawBody);
      } catch (error) {
        throw new BodyParsingError('Invalid JSON body.');
      }
    }

    if (contentType.includes('multipart/form-data') || contentType.includes('application/x-www-form-urlencoded')) {
      try {
        const formData = await request.formData();
        const { arrayStrategy, singleValueStrategy, coerce } = this.parserOptions.body;
        const data = this.parseFormData(formData, arrayStrategy, singleValueStrategy, coerce);

        if (Object.keys(data).length === 0) {
          return this.resolveEmptyBody();
        }

        return data;
      } catch (error) {
        throw new BodyParsingError('Invalid Form Data.');
      }
    }

    if (this.parserOptions.body.strictContentType) {
      throw new BodyParsingError(
        'Unsupported content type. Expected application/json, multipart/form-data, or application/x-www-form-urlencoded.',
      );
    }

    const rawBody = await request.text();
    if (rawBody.length === 0) {
      return this.resolveEmptyBody();
    }

    if (this.parserOptions.body.fallbackStrategy === 'text') {
      return this.coerceStringValue(rawBody, 'body', this.parserOptions.body.coerce);
    }

    try {
      return JSON.parse(rawBody);
    } catch (error) {
      return this.coerceStringValue(rawBody, 'body', this.parserOptions.body.coerce);
    }
  }

  private buildErrorResponse(message: string, issues?: ValidationIssue[], status = 400) {
    return new Response(JSON.stringify({ message, issues }), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }
}
