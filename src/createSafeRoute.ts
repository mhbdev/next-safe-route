import { ValidationAdapter } from './adapters/types';
import { zodAdapter } from './adapters/zod';
import { RouteHandlerBuilder } from './routeHandlerBuilder';
import { HandlerServerErrorFn } from './types';

type CreateSafeRouteParams<TContext extends Record<string, unknown>> = {
  handleServerError?: HandlerServerErrorFn;
  validationAdapter?: ValidationAdapter;
  baseContext?: TContext;
};

export function createSafeRoute<TContext extends Record<string, unknown> = Record<string, unknown>>(
  params?: CreateSafeRouteParams<TContext>,
) {
  return new RouteHandlerBuilder<undefined, undefined, undefined, TContext>({
    handleServerError: params?.handleServerError,
    validationAdapter: params?.validationAdapter ?? zodAdapter(),
    baseContext: params?.baseContext,
  });
}
