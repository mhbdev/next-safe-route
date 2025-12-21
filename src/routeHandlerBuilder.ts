import { Schema, ValidationAdapter, ValidationIssue } from './adapters/types';
import { zodAdapter } from './adapters/zod';
import {
  HandlerFunction,
  HandlerServerErrorFn,
  InferMaybe,
  OriginalRouteHandler,
  RouteContext,
  ValidationErrorHandler,
} from './types';

type Middleware<T = Record<string, unknown>> = (request: Request) => Promise<T | Response>;

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
  private middlewares: Middleware[];
  private handleServerError?: HandlerServerErrorFn;
  private validationErrorHandler?: ValidationErrorHandler;
  private validationAdapter: ValidationAdapter;
  private baseContext: TContext;

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
  }: {
    config?: BuilderConfig<TParams, TQuery, TBody>;
    middlewares?: Middleware[];
    handleServerError?: HandlerServerErrorFn;
    validationErrorHandler?: ValidationErrorHandler;
    validationAdapter?: ValidationAdapter;
    baseContext?: TContext;
  }) {
    this.config = config;
    this.middlewares = middlewares;
    this.handleServerError = handleServerError;
    this.validationErrorHandler = validationErrorHandler;
    this.validationAdapter = validationAdapter;
    this.baseContext = (baseContext ?? {}) as TContext;
  }

  params<T extends Schema>(schema: T): RouteHandlerBuilder<T, TQuery, TBody, TContext> {
    return new RouteHandlerBuilder<T, TQuery, TBody, TContext>({
      config: { ...this.config, paramsSchema: schema },
      middlewares: this.middlewares,
      handleServerError: this.handleServerError,
      validationErrorHandler: this.validationErrorHandler,
      validationAdapter: this.validationAdapter,
      baseContext: this.baseContext,
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
    });
  }

  use<TReturnType extends Record<string, unknown>>(middleware: Middleware<TReturnType>) {
    return new RouteHandlerBuilder<TParams, TQuery, TBody, TContext & TReturnType>({
      config: this.config,
      middlewares: [...this.middlewares, middleware],
      handleServerError: this.handleServerError,
      validationErrorHandler: this.validationErrorHandler,
      validationAdapter: this.validationAdapter,
      baseContext: this.baseContext as unknown as TContext & TReturnType,
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
          const result = await middleware(request);
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

    for (const key of keys) {
      const values = url.searchParams.getAll(key);
      params[key] = values.length === 1 ? values[0] : values;
    }

    return params;
  }

  private async parseRequestBody(request: Request): Promise<unknown> {
    if (!this.config.bodySchema) {
      return {};
    }

    const contentType = request.headers.get('content-type') ?? '';

    if (contentType.includes('application/json')) {
      const rawBody = await request.text();

      if (rawBody.length === 0) {
        return {};
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
        const data: Record<string, unknown> = {};
        const keys = Array.from(new Set(formData.keys()));

        for (const key of keys) {
          const values = formData.getAll(key);
          data[key] = values.length === 1 ? values[0] : values;
        }

        return data;
      } catch (error) {
        throw new BodyParsingError('Invalid Form Data.');
      }
    }

    throw new BodyParsingError(
      'Unsupported content type. Expected application/json, multipart/form-data, or application/x-www-form-urlencoded.',
    );
  }

  private buildErrorResponse(message: string, issues?: ValidationIssue[], status = 400) {
    return new Response(JSON.stringify({ message, issues }), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }
}
