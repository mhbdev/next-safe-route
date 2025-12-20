import { Infer, Schema } from './adapters/types';

export type InferMaybe<TSchema extends Schema | undefined> = TSchema extends Schema
  ? Infer<TSchema>
  : Record<string, unknown>;

export type RouteContext<TRawParams extends Record<string, unknown> = Record<string, string | string[]>> = {
  params: TRawParams;
};

export type HandlerFunction<TParams, TQuery, TBody, TContext> = (
  request: Request,
  context: { params: TParams; query: TQuery; body: TBody; data: TContext },
) => Response | Promise<Response>;

export type OriginalRouteHandler = (request: Request, context: RouteContext) => Response | Promise<Response>;

export type HandlerServerErrorFn = (error: Error) => Response;
