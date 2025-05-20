import axios from "axios"
import { Mutex } from "async-mutex"

import {
  InvalidTickerError,
  ExchangeServiceError,
  UnknownExchangeServiceError,
  InvalidExchangeConfigError,
} from "@domain/exchanges"
import { CacheKeys } from "@domain/cache"
import { toPrice, toSeconds, toTimestamp } from "@domain/primitives"

import { LocalCacheService } from "@services/cache"
import { baseLogger } from "@services/logger"

import { cleanRatesObject, isRatesObjectValid } from "@utils"

const mutex = new Mutex()
export const CurrencyBeaconExchangeService = async ({
  base,
  quote,
  config,
}: CurrencyBeaconExchangeServiceArgs): Promise<
  IExchangeService | ExchangeServiceError
> => {
  if (!config || !config.apiKey) return new InvalidExchangeConfigError()

  const { baseUrl, apiKey, timeout, cacheSeconds, ...params } = config

  const url = baseUrl || "https://api.currencybeacon.com/v1"
  const cacheKey = `${CacheKeys.CurrentTicker}:currencybeacon:${base}:*`
  const cacheTtlSecs = Number(cacheSeconds)
  const cacheKeyStatus = `${cacheKey}:status`

  const getCachedRates = async (): Promise<CurrencyBeaconRates | undefined> => {
    const cachedTickers = await LocalCacheService().get<CurrencyBeaconRates>(cacheKey)
    if (cachedTickers instanceof Error) return undefined
    return cachedTickers
  }

  const getLastRequestStatus = async (): Promise<number> => {
    const status = await LocalCacheService().get<number>(cacheKeyStatus)
    if (status instanceof Error) return 0
    return status
  }

  const fetchTicker = async (): Promise<Ticker | ServiceError> => {
    // We cant use response.data.response.date because
    // CurrencyBeacon does not behave like a bitcoin exchange
    const timestamp = new Date().getTime()

    try {
      const cachedRates = await getCachedRates()
      if (cachedRates) return tickerFromRaw({ rate: cachedRates[quote], timestamp })

      // avoid cloudflare ban if apiKey is no longer valid
      const lastCachedStatus = await getLastRequestStatus()
      if (lastCachedStatus >= 400)
        return new UnknownExchangeServiceError(
          `Invalid response. Error ${lastCachedStatus}`,
        )

      const { status, data } = await axios.get<GetCurrencyBeaconRatesResponse>(
        `${url}/latest`,
        {
          timeout: Number(timeout || 5000),
          params: {
            api_key: apiKey,
            base,
            ...params,
          },
        },
      )
      const rates = cleanRatesObject(data?.response?.rates)

      if (status >= 400 || !isRatesObjectValid<CurrencyBeaconRates>(rates)) {
        await LocalCacheService().set<number>({
          key: cacheKeyStatus,
          value: status,
          ttlSecs: toSeconds(cacheTtlSecs > 0 ? cacheTtlSecs : 300),
        })
        return new UnknownExchangeServiceError(`Invalid response. Error ${status}`)
      }

      await LocalCacheService().set<CurrencyBeaconRates>({
        key: cacheKey,
        value: rates,
        ttlSecs: toSeconds(cacheTtlSecs > 0 ? cacheTtlSecs : 300),
      })

      return tickerFromRaw({ rate: rates[quote], timestamp })
    } catch (error) {
      baseLogger.error({ error }, "CurrencyBeacon unknown error")
      return new UnknownExchangeServiceError(error.message || error)
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
  rate: number
  timestamp: number
}): Ticker | InvalidTickerError => {
  if (rate > 0 && timestamp > 0) {
    return {
      bid: toPrice(rate),
      ask: toPrice(rate),
      timestamp: toTimestamp(timestamp),
    }
  }

  return new InvalidTickerError()
}
