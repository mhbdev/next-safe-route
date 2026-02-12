import { ValidationAdapter } from './adapters/types';
import { zodAdapter } from './adapters/zod';
import { RouteHandlerBuilder } from './routeHandlerBuilder';
import { HandlerServerErrorFn, ParserOptions, ValidationErrorHandler } from './types';

type CreateSafeRouteParams<TContext extends Record<string, unknown>> = {
  handleServerError?: HandlerServerErrorFn;
  validationErrorHandler?: ValidationErrorHandler;
  validationAdapter?: ValidationAdapter;
  baseContext?: TContext;
  parserOptions?: ParserOptions;
};

export function createSafeRoute<TContext extends Record<string, unknown> = Record<string, unknown>>(
  params?: CreateSafeRouteParams<TContext>,
) {
  return new RouteHandlerBuilder<undefined, undefined, undefined, TContext>({
    handleServerError: params?.handleServerError,
    validationErrorHandler: params?.validationErrorHandler,
    validationAdapter: params?.validationAdapter ?? zodAdapter(),
    baseContext: params?.baseContext,
    parserOptions: params?.parserOptions,
  });
}
