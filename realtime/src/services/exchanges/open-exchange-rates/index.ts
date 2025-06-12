import axios from "axios"
import { Mutex } from "async-mutex"

import {
  InvalidTickerError,
  ExchangeServiceError,
  UnknownExchangeServiceError,
  InvalidExchangeConfigError,
  InvalidExchangeResponseError,
} from "@domain/exchanges"
import { CacheKeys } from "@domain/cache"
import { toPrice, toSeconds, toTimestamp } from "@domain/primitives"

import { LocalCacheService } from "@services/cache"
import { baseLogger } from "@services/logger"

import { cleanRatesObject, isRatesObjectValid } from "@utils"

const mutex = new Mutex()

export const OpenExchangeRatesService = async ({
  base,
  quote,
  config,
}: OpenExchangeRatesServiceArgs): Promise<IExchangeService | ExchangeServiceError> => {
  if (!config?.apiKey) {
    return new InvalidExchangeConfigError()
  }

  const {
    baseUrl = "https://openexchangerates.org/api",
    timeout = 5000,
    cacheSeconds = 300,
    ...params
  } = config

  const cacheKey = `${CacheKeys.CurrentTicker}:openexchangerates:${base}:*`
  const cacheKeyStatus = `${cacheKey}:status`
  const cacheTtlSecs = toSeconds(Number(cacheSeconds))

  const fetchTicker = async (): Promise<Ticker | ServiceError> => {
    const now = Date.now()

    try {
      const cachedRates = await getCachedRates(cacheKey)
      if (cachedRates) {
        return tickerFromRaw({ rate: cachedRates[quote], timestamp: now })
      }

      const lastStatus = await getLastRequestStatus(cacheKeyStatus)
      if (lastStatus >= 400) {
        return new UnknownExchangeServiceError(`Invalid response. Error ${lastStatus}`)
      }

      const { status, data } = await axios.get<GetOpenExchangeRatesResponse>(
        `${baseUrl}/latest.json`,
        {
          timeout: Number(timeout),
          params: {
            app_id: config.apiKey,
            prettyprint: false,
            show_alternative: false,
            ...params,
          },
        },
      )

      if (status >= 400 || !data?.rates) {
        return new UnknownExchangeServiceError(`Invalid response. Error ${status}`)
      }

      const rates = cleanRatesObject(data.rates)
      if (!isRatesObjectValid<OpenExchangeRatesRates>(rates)) {
        return new InvalidExchangeResponseError("No valid rates in response")
      }

      await LocalCacheService().set<OpenExchangeRatesRates>({
        key: cacheKey,
        value: rates,
        ttlSecs: cacheTtlSecs,
      })

      return tickerFromRaw({
        rate: rates[quote],
        timestamp: data.timestamp * 1000,
      })
    } catch (err) {
      baseLogger.error({ err }, "OpenExchangeRates unknown error")
      return new UnknownExchangeServiceError((err as Error).message || err)
    }
  }

  return {
    fetchTicker: () => mutex.runExclusive(fetchTicker),
  }
}

const tickerFromRaw = ({
  rate,
  timestamp,
}: {
  rate: number | undefined
  timestamp: number
}): Ticker | InvalidTickerError => {
  if (rate && rate > 0 && timestamp > 0) {
    return {
      bid: toPrice(rate),
      ask: toPrice(rate),
      timestamp: toTimestamp(timestamp),
    }
  }
  return new InvalidTickerError()
}

const getCachedRates = async (
  cacheKey: string,
): Promise<OpenExchangeRatesRates | undefined> => {
  const cached = await LocalCacheService().get<OpenExchangeRatesRates>(cacheKey)
  return cached instanceof Error ? undefined : cached
}

const getLastRequestStatus = async (statusKey: string): Promise<number> => {
  const status = await LocalCacheService().get<number>(statusKey)
  return status instanceof Error ? 0 : status
}
