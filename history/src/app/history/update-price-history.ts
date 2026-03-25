import { getExchangesConfig } from "@config"
import { getLimitByRange, getTimeframeByRange } from "@domain/exchanges"
import {
  getStartDateByRange,
  LastPriceEmptyRepositoryError,
  PriceRange,
} from "@domain/price"
import { toTimestamp } from "@domain/primitives"
import { PriceRepository } from "@services/database"
import { ExchangeFactory } from "@services/exchanges"
import { baseLogger } from "@services/logger"

const exchangeFactory = ExchangeFactory()

export const updatePriceHistory = async (): Promise<boolean | ApplicationError> => {
  const exchanges = getExchangesConfig()
  let anyExchangeSucceeded = false

  for (const exchange of exchanges) {
    const prices: Tick[] = []
    const { name, base, quote } = exchange

    let exchangeFailed = false
    for (const range in PriceRange) {
      const result = await queryByRange({ range: PriceRange[range], exchange })
      if (result instanceof Error) {
        baseLogger.error(
          {
            error: result,
            message: result.message,
            range: PriceRange[range],
            exchange: name,
          },
          "Could not query price history",
        )
        exchangeFailed = true
        break
      }
      baseLogger.info(
        { records: result.length, range: PriceRange[range], exchange: name },
        "Price history query",
      )
      prices.push(...result)
    }

    if (exchangeFailed) continue

    const result = await PriceRepository().updatePrices({
      exchange: name,
      base,
      quote,
      prices,
    })
    if (result instanceof Error) {
      baseLogger.error(
        { error: result, message: result.message, exchange: name },
        "Could not update price history",
      )
      continue
    }
    baseLogger.info({ recordsUpdated: result, exchange: name }, "Price history updated")
    anyExchangeSucceeded = true
  }

  return anyExchangeSucceeded
}

const queryByRange = async ({
  range,
  exchange,
}: {
  range: PriceRange
  exchange: ExchangeConfig
}): Promise<Tick[] | ApplicationError> => {
  const { name, base, quote } = exchange

  const exchangeService = await exchangeFactory.create(exchange)
  if (exchangeService instanceof Error) return exchangeService

  const priceRepository = PriceRepository()
  const lastPrice = await priceRepository.getLastPrice({
    exchange: name,
    base,
    quote,
    range,
  })
  const isLastPriceEmpty = lastPrice instanceof LastPriceEmptyRepositoryError
  if (lastPrice instanceof Error && !isLastPriceEmpty) return lastPrice

  const timeframe = getTimeframeByRange(range)
  const since =
    lastPrice instanceof Error
      ? getStartDateByRange(range)
      : toTimestamp(lastPrice.timestamp * 1000)
  const limit = getLimitByRange(range)
  return exchangeService.listPrices({ timeframe, since, limit })
}
