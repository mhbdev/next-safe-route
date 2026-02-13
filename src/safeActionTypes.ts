import type { Infer, InferIn, Schema, ValidationAdapter, ValidationIssue } from './adapters/types';

type Awaitable<T> = T | Promise<T>;

type ActionInputArgs<TInput> = [TInput] extends [void] ? [] | [TInput] : [input: TInput];

export type InferActionInput<TSchema extends Schema | undefined> = TSchema extends Schema ? InferIn<TSchema> : void;

export type InferParsedActionInput<TSchema extends Schema | undefined> = TSchema extends Schema
  ? Infer<TSchema>
  : undefined;

export type SafeActionValidationErrors = {
  fieldErrors: Record<string, string[]>;
  formErrors: string[];
};

export type SafeActionSuccessResult<TData> = {
  data: TData;
  validationErrors?: undefined;
  serverError?: undefined;
};

export type SafeActionValidationErrorResult = {
  data?: undefined;
  validationErrors: SafeActionValidationErrors;
  serverError?: undefined;
};

export type SafeActionServerErrorResult = {
  data?: undefined;
  validationErrors?: undefined;
  serverError: string;
};

export type SafeActionResult<TData> =
  | SafeActionSuccessResult<TData>
  | SafeActionValidationErrorResult
  | SafeActionServerErrorResult;

export type SafeActionFn<TInput, TData> = (...args: ActionInputArgs<TInput>) => Promise<SafeActionResult<TData>>;

export type SafeActionMiddlewareNext<TCtxPatch extends Record<string, unknown>, TData> = (options?: {
  ctx?: TCtxPatch;
}) => Promise<SafeActionResult<TData>>;

export type SafeActionMiddleware<
  TParsedInput,
  TCtx extends Record<string, unknown>,
  TMetadata extends Record<string, unknown>,
  TCtxPatch extends Record<string, unknown> = Record<string, unknown>,
  TData = unknown,
> = (args: {
  parsedInput: TParsedInput;
  ctx: TCtx;
  metadata: TMetadata;
  next: SafeActionMiddlewareNext<TCtxPatch, TData>;
}) => Awaitable<SafeActionResult<TData>>;

export type AnySafeActionMiddleware = SafeActionMiddleware<
  unknown,
  Record<string, unknown>,
  Record<string, unknown>,
  Record<string, unknown>,
  unknown
>;

export type SafeActionHandler<TParsedInput, TCtx extends Record<string, unknown>, TMetadata, TData> = (args: {
  parsedInput: TParsedInput;
  ctx: TCtx;
  metadata: TMetadata;
}) => Awaitable<TData>;

export type SafeActionClientOptions<TContext extends Record<string, unknown>> = {
  validationAdapter?: ValidationAdapter;
  baseContext?: TContext;
  defaultServerError?: string;
  handleServerError?: (error: unknown) => string;
};

export type SafeActionBuilderConfig<
  TInputSchema extends Schema | undefined,
  TOutputSchema extends Schema | undefined,
  TContext extends Record<string, unknown>,
  TMetadata extends Record<string, unknown>,
> = {
  inputSchema?: TInputSchema;
  outputSchema?: TOutputSchema;
  validationAdapter: ValidationAdapter;
  baseContext: TContext;
  metadata: TMetadata;
  middlewares: AnySafeActionMiddleware[];
  defaultServerError: string;
  handleServerError?: (error: unknown) => string;
};

export type NormalizeValidationIssuesFn = (issues: ValidationIssue[]) => SafeActionValidationErrors;
