import type { Infer, Schema } from './adapters/types';
import {
  type AnySafeActionMiddleware,
  type InferActionInput,
  type InferParsedActionInput,
  type SafeActionBuilderConfig,
  type SafeActionFn,
  type SafeActionHandler,
  type SafeActionMiddleware,
  type SafeActionResult,
} from './safeActionTypes';
import {
  createServerErrorResult,
  createValidationErrorResult,
  isSafeActionResult,
  mergeContexts,
} from './safeActionUtils';

type DefaultObject = Record<string, never>;

function toSafeServerError(error: unknown, defaultServerError: string, mapper?: (error: unknown) => string) {
  if (!mapper) {
    return defaultServerError;
  }

  try {
    const mapped = mapper(error);
    if (typeof mapped === 'string' && mapped.length > 0) {
      return mapped;
    }
    return defaultServerError;
  } catch (mappingError) {
    return defaultServerError;
  }
}

export class SafeActionBuilder<
  TInputSchema extends Schema | undefined = undefined,
  TOutputSchema extends Schema | undefined = undefined,
  TContext extends Record<string, unknown> = Record<string, unknown>,
  TMetadata extends Record<string, unknown> = DefaultObject,
> {
  private config: SafeActionBuilderConfig<TInputSchema, TOutputSchema, TContext, TMetadata>;

  constructor(config: SafeActionBuilderConfig<TInputSchema, TOutputSchema, TContext, TMetadata>) {
    this.config = config;
  }

  inputSchema<TSchema extends Schema>(schema: TSchema) {
    return new SafeActionBuilder<TSchema, TOutputSchema, TContext, TMetadata>({
      ...this.config,
      inputSchema: schema,
    });
  }

  outputSchema<TSchema extends Schema>(schema: TSchema) {
    return new SafeActionBuilder<TInputSchema, TSchema, TContext, TMetadata>({
      ...this.config,
      outputSchema: schema,
    });
  }

  metadata<TNextMetadata extends Record<string, unknown>>(metadata: TNextMetadata) {
    return new SafeActionBuilder<TInputSchema, TOutputSchema, TContext, TNextMetadata>({
      ...this.config,
      metadata,
      middlewares: this.config.middlewares as unknown as SafeActionBuilderConfig<
        TInputSchema,
        TOutputSchema,
        TContext,
        TNextMetadata
      >['middlewares'],
    });
  }

  use<TContextPatch extends Record<string, unknown>>(
    middleware: SafeActionMiddleware<InferParsedActionInput<TInputSchema>, TContext, TMetadata, TContextPatch>,
  ) {
    return new SafeActionBuilder<TInputSchema, TOutputSchema, TContext & TContextPatch, TMetadata>({
      ...this.config,
      middlewares: [...this.config.middlewares, middleware as unknown as AnySafeActionMiddleware],
      baseContext: this.config.baseContext as TContext & TContextPatch,
    });
  }

  action<TData>(
    handler: SafeActionHandler<InferParsedActionInput<TInputSchema>, TContext, TMetadata, TData>,
  ): SafeActionFn<InferActionInput<TInputSchema>, TOutputSchema extends Schema ? Infer<TOutputSchema> : TData> {
    type TParsedInput = InferParsedActionInput<TInputSchema>;
    type TFinalData = TOutputSchema extends Schema ? Infer<TOutputSchema> : TData;

    const {
      inputSchema,
      outputSchema,
      validationAdapter,
      middlewares,
      metadata,
      baseContext,
      defaultServerError,
      handleServerError,
    } = this.config;

    const actionFn = async (...args: unknown[]): Promise<SafeActionResult<TFinalData>> => {
      try {
        const rawInput = args.length > 0 ? args[0] : undefined;
        let parsedInput: TParsedInput;

        if (!inputSchema) {
          parsedInput = undefined as TParsedInput;
        } else {
          const inputResult = await validationAdapter.validate(inputSchema, rawInput);
          if (inputResult.success === false) {
            return createValidationErrorResult(inputResult.issues);
          }
          parsedInput = inputResult.data as TParsedInput;
        }

        const runHandler = async (ctx: Record<string, unknown>): Promise<SafeActionResult<TFinalData>> => {
          const handlerResult = await handler({
            parsedInput,
            ctx: ctx as TContext,
            metadata,
          });

          if (!outputSchema) {
            return {
              data: handlerResult as TFinalData,
            };
          }

          const outputResult = await validationAdapter.validate(outputSchema, handlerResult);
          if (outputResult.success === false) {
            return createServerErrorResult<TFinalData>(
              toSafeServerError(new Error('Invalid action output.'), defaultServerError, handleServerError),
            );
          }

          return {
            data: outputResult.data as TFinalData,
          };
        };

        const runMiddleware = async (
          index: number,
          ctx: Record<string, unknown>,
        ): Promise<SafeActionResult<TFinalData>> => {
          if (index >= middlewares.length) {
            return runHandler(ctx);
          }

          const middleware = middlewares[index] as SafeActionMiddleware<
            TParsedInput,
            Record<string, unknown>,
            TMetadata,
            Record<string, unknown>,
            TFinalData
          >;

          let nextCalled = false;

          const next = async (options?: { ctx?: Record<string, unknown> }) => {
            if (nextCalled) {
              throw new Error('next() called more than once in the same middleware.');
            }
            nextCalled = true;

            return runMiddleware(index + 1, mergeContexts(ctx, options?.ctx));
          };

          const middlewareResult = await middleware({
            parsedInput,
            ctx,
            metadata,
            next,
          });

          if (!isSafeActionResult<TFinalData>(middlewareResult)) {
            throw new Error('Middleware must return a SafeActionResult.');
          }

          return middlewareResult;
        };

        const initialContext = { ...baseContext } as Record<string, unknown>;
        return await runMiddleware(0, initialContext);
      } catch (error) {
        return createServerErrorResult<TFinalData>(toSafeServerError(error, defaultServerError, handleServerError));
      }
    };

    return actionFn as SafeActionFn<InferActionInput<TInputSchema>, TFinalData>;
  }
}
