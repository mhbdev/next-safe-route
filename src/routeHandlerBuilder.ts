import { Schema, ValidationAdapter, ValidationIssue } from './adapters/types';
import { zodAdapter } from './adapters/zod';
import { HandlerFunction, HandlerServerErrorFn, InferMaybe, OriginalRouteHandler, RouteContext } from './types';

type Middleware<T = Record<string, unknown>> = (request: Request) => Promise<T>;

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
    baseContext,
  }: {
    config?: BuilderConfig<TParams, TQuery, TBody>;
    middlewares?: Middleware[];
    handleServerError?: HandlerServerErrorFn;
    validationAdapter?: ValidationAdapter;
    baseContext?: TContext;
  }) {
    this.config = config;
    this.middlewares = middlewares;
    this.handleServerError = handleServerError;
    this.validationAdapter = validationAdapter;
    this.baseContext = (baseContext ?? {}) as TContext;
  }

  params<T extends Schema>(schema: T): RouteHandlerBuilder<T, TQuery, TBody, TContext> {
    return new RouteHandlerBuilder<T, TQuery, TBody, TContext>({
      config: { ...this.config, paramsSchema: schema },
      middlewares: this.middlewares,
      handleServerError: this.handleServerError,
      validationAdapter: this.validationAdapter,
      baseContext: this.baseContext,
    });
  }

  query<T extends Schema>(schema: T): RouteHandlerBuilder<TParams, T, TBody, TContext> {
    return new RouteHandlerBuilder<TParams, T, TBody, TContext>({
      config: { ...this.config, querySchema: schema },
      middlewares: this.middlewares,
      handleServerError: this.handleServerError,
      validationAdapter: this.validationAdapter,
      baseContext: this.baseContext,
    });
  }

  body<T extends Schema>(schema: T): RouteHandlerBuilder<TParams, TQuery, T, TContext> {
    return new RouteHandlerBuilder<TParams, TQuery, T, TContext>({
      config: { ...this.config, bodySchema: schema },
      middlewares: this.middlewares,
      handleServerError: this.handleServerError,
      validationAdapter: this.validationAdapter,
      baseContext: this.baseContext,
    });
  }

  use<TReturnType extends Record<string, unknown>>(middleware: Middleware<TReturnType>) {
    return new RouteHandlerBuilder<TParams, TQuery, TBody, TContext & TReturnType>({
      config: this.config,
      middlewares: [...this.middlewares, middleware],
      handleServerError: this.handleServerError,
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
          middlewareContext = { ...middlewareContext, ...result };
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

    return { success: false, response: this.buildErrorResponse(errorMessage, result.issues) };
  }

  private getQueryParams(request: Request) {
    const url = new URL(request.url);
    return Object.fromEntries(url.searchParams.entries());
  }

  private async parseRequestBody(request: Request): Promise<unknown> {
    if (!this.config.bodySchema) {
      return {};
    }

    const contentType = request.headers.get('content-type') ?? '';
    const rawBody = await request.text();

    if (rawBody.length === 0) {
      return {};
    }

    if (!contentType.includes('application/json')) {
      throw new BodyParsingError('Unsupported content type. Expected application/json.');
    }

    try {
      return JSON.parse(rawBody);
    } catch (error) {
      throw new BodyParsingError('Invalid JSON body.');
    }
  }

  private buildErrorResponse(message: string, issues?: ValidationIssue[], status = 400) {
    return new Response(JSON.stringify({ message, issues }), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }
}
