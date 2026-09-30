import {
  trace,
  context,
  propagation,
  SpanOptions,
  TimeInput,
  Context,
  Attributes,
  Exception,
  SpanStatusCode,
  Span as OriginalSpan,
} from "@opentelemetry/api"
import {
  SemanticAttributes,
  SemanticResourceAttributes,
} from "@opentelemetry/semantic-conventions"
import { defaultResource, resourceFromAttributes } from "@opentelemetry/resources"
import { W3CTraceContextPropagator } from "@opentelemetry/core"
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node"
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http"
import { GrpcInstrumentation } from "@opentelemetry/instrumentation-grpc"
import { registerInstrumentations } from "@opentelemetry/instrumentation"
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http"
import { SimpleSpanProcessor, Span as SdkSpan } from "@opentelemetry/sdk-trace-base"

import { tracingConfig } from "@config"

import { ErrorLevel, RankedErrorLevel } from "@domain/errors"
import { parseErrorFromUnknown } from "@domain/shared/error-parsers"

type ExtendedException = Exclude<Exception, string> & {
  level?: ErrorLevel
}

propagation.setGlobalPropagator(new W3CTraceContextPropagator())

registerInstrumentations({
  instrumentations: [
    new HttpInstrumentation({
      ignoreIncomingRequestHook: (request) => request.url === "/healthz",
    }),
    new GrpcInstrumentation(),
  ],
})

class SpanProcessorWrapper extends SimpleSpanProcessor {
  onStart(span: SdkSpan, parentContext: Context) {
    const ctx = context.active()
    if (ctx) {
      const baggage = propagation.getBaggage(ctx)
      if (baggage) {
        baggage.getAllEntries().forEach(([key, entry]) => {
          span.setAttribute(key, entry.value)
        })
      }
    }
    super.onStart(span, parentContext)
  }

  onEnd(span: SdkSpan) {
    if (tracingConfig.enableFilter) {
      const errorLevel = span.attributes["error.level"]
      if (!errorLevel || errorLevel === ErrorLevel.Info) {
        return // Ignore the span if it has no error or if error is info level
      }
    }

    super.onEnd(span)
  }
}
const provider = new NodeTracerProvider({
  resource: defaultResource().merge(
    resourceFromAttributes({
      [SemanticResourceAttributes.SERVICE_NAME]: tracingConfig.otelServiceName,
    }),
  ),
  spanProcessors: [new SpanProcessorWrapper(new OTLPTraceExporter())],
})

provider.register()

export const tracer = trace.getTracer(
  tracingConfig.otelServiceName,
  process.env.COMMITHASH || "dev",
)
export const addAttributesToCurrentSpan = (attributes: Attributes) => {
  const span = trace.getSpan(context.active())
  if (span) {
    for (const [key, value] of Object.entries(attributes)) {
      if (value) {
        span.setAttribute(key, value)
      }
    }
  }
  return span
}

export const addEventToCurrentSpan = (
  name: string,
  attributesOrStartTime?: Attributes | TimeInput | undefined,
  startTime?: TimeInput | undefined,
) => {
  const span = trace.getSpan(context.active())
  if (span) {
    span.addEvent(name, attributesOrStartTime, startTime)
  }
}

const updateErrorForSpan = ({
  span,
  errorLevel,
}: {
  span: ExtendedSpan
  errorLevel: ErrorLevel
}): boolean => {
  const spanErrorLevel =
    (span && span.attributes && (span.attributes["error.level"] as ErrorLevel)) ||
    ErrorLevel.Info
  const spanErrorRank = RankedErrorLevel.indexOf(spanErrorLevel)
  const errorRank = RankedErrorLevel.indexOf(errorLevel)

  return errorRank >= spanErrorRank
}

const recordException = (
  span: ExtendedSpan,
  exception: ExtendedException,
  level?: ErrorLevel,
) => {
  const errorLevel = level || exception["level"] || ErrorLevel.Warn

  // Write error attributes if update checks pass
  if (updateErrorForSpan({ span, errorLevel })) {
    span.setAttribute("error.level", errorLevel)
    span.setAttribute("error.name", exception["name"] || "undefined")
    span.setAttribute("error.message", exception["message"] || "undefined")
  }

  // Append error with next index
  let nextIdx = 0
  while (span.attributes && span.attributes[`error.${nextIdx}.level`] !== undefined) {
    nextIdx++
  }
  span.setAttribute(`error.${nextIdx}.level`, errorLevel)
  span.setAttribute(`error.${nextIdx}.name`, exception["name"] || "undefined")
  span.setAttribute(`error.${nextIdx}.message`, exception["message"] || "undefined")

  span.recordException(exception)
  span.setStatus({ code: SpanStatusCode.ERROR })
}

export const asyncRunInSpan = <F extends () => ReturnType<F>>(
  spanName: string,
  options: SpanOptions,
  fn: F,
) => {
  const ret = tracer.startActiveSpan(spanName, options, async (span) => {
    try {
      const ret = await Promise.resolve(fn())
      if ((ret as unknown) instanceof Error) {
        recordException(span, ret as Error)
      }
      span.end()
      return ret
    } catch (error) {
      const err = parseErrorFromUnknown(error)
      recordException(span, err, ErrorLevel.Critical)
      span.end()
      throw error
    }
  })
  return ret
}

const resolveFunctionSpanOptions = ({
  namespace,
  functionName,
  functionArgs,
  spanAttributes,
  root,
}: {
  namespace: string
  functionName: string
  functionArgs: Array<unknown>
  spanAttributes?: Attributes
  root?: boolean
}): SpanOptions => {
  const attributes = {
    [SemanticAttributes.CODE_FUNCTION]: functionName,
    [SemanticAttributes.CODE_NAMESPACE]: namespace,
    ...spanAttributes,
  }
  if (functionArgs && functionArgs.length > 0) {
    const params =
      typeof functionArgs[0] === "object" ? functionArgs[0] : { "0": functionArgs[0] }
    for (const key in params) {
      /* eslint @typescript-eslint/ban-ts-comment: "off" */
      // @ts-ignore-next-line no-implicit-any error
      const value = params[key]
      attributes[`${SemanticAttributes.CODE_FUNCTION}.params.${key}`] = value
      attributes[`${SemanticAttributes.CODE_FUNCTION}.params.${key}.null`] =
        value === null
      attributes[`${SemanticAttributes.CODE_FUNCTION}.params.${key}.undefined`] =
        value === undefined
    }
  }
  return { attributes, root }
}

export const wrapToRunInSpan = <
  A extends Array<unknown>,
  R extends PartialResult<unknown> | unknown,
>({
  fn,
  fnName,
  namespace,
  spanAttributes,
  root,
}: {
  fn: (...args: A) => PromiseReturnType<R>
  fnName?: string
  namespace: string
  spanAttributes?: Attributes
  root?: boolean
}) => {
  const functionName = fnName || fn.name || "unknown"

  const wrappedFn = (...args: A): PromiseReturnType<R> => {
    const spanName = `${namespace}.${functionName}`
    const spanOptions = resolveFunctionSpanOptions({
      namespace,
      functionName,
      functionArgs: args,
      spanAttributes,
      root,
    })
    const ret = tracer.startActiveSpan(spanName, spanOptions, (span) => {
      try {
        const ret = fn(...args)
        if (ret instanceof Error) recordException(span, ret)
        const partialRet = ret as PartialResult<unknown>
        if (partialRet?.partialResult && partialRet?.error)
          recordException(span, partialRet.error)
        span.end()
        return ret
      } catch (error) {
        const err = parseErrorFromUnknown(error)
        recordException(span, err, ErrorLevel.Critical)
        span.end()
        throw error
      }
    })
    return ret
  }

  // Re-add the original name to the wrapped function
  Object.defineProperty(wrappedFn, "name", {
    value: functionName,
    configurable: true,
  })

  return wrappedFn
}

type PromiseReturnType<T> = T extends Promise<infer Return> ? Return : T

export const wrapAsyncToRunInSpan = <
  A extends Array<unknown>,
  R extends PartialResult<unknown> | unknown,
>({
  fn,
  fnName,
  namespace,
  spanAttributes,
  root,
}: {
  fn: (...args: A) => Promise<PromiseReturnType<R>>
  fnName?: string
  namespace: string
  spanAttributes?: Attributes
  root?: boolean
}) => {
  const functionName = fnName || fn.name || "unknown"

  const wrappedFn = (...args: A): Promise<PromiseReturnType<R>> => {
    const spanName = `${namespace}.${functionName}`
    const spanOptions = resolveFunctionSpanOptions({
      namespace,
      functionName,
      functionArgs: args,
      spanAttributes,
      root,
    })
    const ret = tracer.startActiveSpan(spanName, spanOptions, async (span) => {
      try {
        const ret = await fn(...args)
        if (ret instanceof Error) recordException(span, ret)
        const partialRet = ret as PartialResult<unknown>
        if (partialRet?.partialResult && partialRet?.error)
          recordException(span, partialRet.error)
        span.end()
        return ret
      } catch (error) {
        const err = parseErrorFromUnknown(error)
        recordException(span, err, ErrorLevel.Critical)
        span.end()
        throw error
      }
    })
    return ret
  }

  // Re-add the original name to the wrapped function
  Object.defineProperty(wrappedFn, "name", {
    value: functionName,
    configurable: true,
  })

  return wrappedFn
}

type FunctionReturn = PartialResult<unknown> | unknown
type FunctionType = (...args: unknown[]) => PromiseReturnType<FunctionReturn>
type AsyncFunctionType = (
  ...args: unknown[]
) => Promise<PromiseReturnType<FunctionReturn>>

export const wrapAsyncFunctionsToRunInSpan = <F extends object>({
  namespace,
  fns,
  spanAttributes,
}: {
  namespace: string
  fns: F
  spanAttributes?: Attributes
}): F => {
  const functions: Record<string, FunctionType | AsyncFunctionType> = {}
  for (const fnKey of Object.keys(fns)) {
    const fn = fnKey as keyof typeof fns
    const func = fns[fn] as FunctionType
    const fnType = func.constructor.name
    if (fnType === "Function") {
      functions[fnKey] = wrapToRunInSpan({
        namespace,
        fn: func,
        fnName: fnKey,
        spanAttributes,
      })
      continue
    }

    if (fnType === "AsyncFunction") {
      functions[fnKey] = wrapAsyncToRunInSpan({
        namespace,
        fn: fns[fn] as AsyncFunctionType,
        fnName: fnKey,
        spanAttributes,
      })
      continue
    }
  }
  return {
    ...fns,
    ...functions,
  }
}

export const addAttributesToCurrentSpanAndPropagate = <F extends () => ReturnType<F>>(
  attributes: { [key: string]: string | undefined },
  fn: F,
) => {
  const ctx = context.active()
  let baggage = propagation.getBaggage(ctx) || propagation.createBaggage()
  const currentSpan = trace.getSpan(ctx)
  Object.entries(attributes).forEach(([key, value]) => {
    if (value) {
      baggage = baggage.setEntry(key, { value })
      if (currentSpan) {
        currentSpan.setAttribute(key, value)
      }
    }
  })
  return context.with(propagation.setBaggage(ctx, baggage), fn)
}

export const shutdownTracing = async () => {
  await provider.forceFlush()
  await provider.shutdown()
}
export { SemanticAttributes, SemanticResourceAttributes }

export interface ExtendedSpan extends OriginalSpan {
  attributes?: Attributes
}
