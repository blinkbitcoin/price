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
export const FreeCurrencyRatesExchangeService = async ({
  base,
  quote,
  config,
}: FreeCurrencyRatesExchangeServiceArgs): Promise<
  IExchangeService | ExchangeServiceError
> => {
  if (!config) return new InvalidExchangeConfigError()

  const { baseUrl, fallbackUrl, timeout, cacheSeconds } = config

  const url =
    baseUrl ||
    "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies"
  const cacheKey = `${CacheKeys.CurrentTicker}:freecurrencyrates:${base}:*`
  const cacheTtlSecs = Number(cacheSeconds)

  const getCachedRates = async (): Promise<FreeCurrencyRatesRates | undefined> => {
    const cachedTickers = await LocalCacheService().get<FreeCurrencyRatesRates>(cacheKey)
    if (cachedTickers instanceof Error) return undefined
    return cachedTickers
  }

  const fetchTicker = async (): Promise<Ticker | ServiceError> => {
    // We cant use response.data.date because
    // FreeCurrencyRates does not behave like a bitcoin exchange
    const timestamp = new Date().getTime()
    const baseCurrency = base.toLowerCase()
    const quoteCurrency = quote.toLowerCase()

    try {
      const cachedRates = await getCachedRates()
      if (cachedRates) {
        return tickerFromRaw({ rate: cachedRates[quoteCurrency], timestamp })
      }

      const urls = [
        `${url}/${baseCurrency}.min.json`,
        `${url}/${baseCurrency}.json`,
        `${fallbackUrl}/${baseCurrency}.min.json`,
        `${fallbackUrl}/${baseCurrency}.json`,
      ]
      const params = {
        timeout: Number(timeout || 5000),
      }

      const rates = await getWithFallback({ baseCurrency, urls, params })
      if (rates instanceof Error) return rates

      await LocalCacheService().set<FreeCurrencyRatesRates>({
        key: cacheKey,
        value: rates,
        ttlSecs: toSeconds(cacheTtlSecs > 0 ? cacheTtlSecs : 300),
      })

      return tickerFromRaw({ rate: rates[quoteCurrency], timestamp })
    } catch (error) {
      baseLogger.error({ error }, "FreeCurrencyRates unknown error")
      return new UnknownExchangeServiceError(error)
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

const getWithFallback = async ({
  baseCurrency,
  urls,
  params,
}: {
  baseCurrency: string
  urls: string[]
  params: { [key: string]: string | number | boolean }
}): Promise<FreeCurrencyRatesRates | ExchangeServiceError> => {
  for (const url of urls) {
    try {
      const { status, data } = await axios.get(url, params)
      const rates = cleanRatesObject(data ? data[baseCurrency] : undefined)
      if (status === 200 && isRatesObjectValid<FreeCurrencyRatesRates>(rates))
        return rates
    } catch {}
  }

  return new UnknownExchangeServiceError(`Invalid response.`)
}
