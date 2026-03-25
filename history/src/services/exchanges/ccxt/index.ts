import ccxt, { Exchange, OHLCV } from "ccxt"

import {
  ExchangeServiceError,
  InvalidExchangeIdError,
  UnknownExchangeServiceError,
  OHLCVNotSupportedExchangeServiceError,
} from "@domain/exchanges"
import { toPrice, toTimestamp } from "@domain/primitives"

import { baseLogger } from "@services/logger"

import { CcxtExchangeServiceArgs } from "./index.types"

export const CcxtExchangeService = async ({
  exchangeId,
  base,
  quote,
  config,
}: CcxtExchangeServiceArgs): Promise<IExchangeService | ExchangeServiceError> => {
  const symbol = `${base}/${quote}`
  const id = ccxt.exchanges.find((e) => e === exchangeId)
  if (!id) return new InvalidExchangeIdError()

  const client: Exchange = new ccxt[exchangeId](config)

  try {
    await client.loadMarkets()
  } catch (error) {
    baseLogger.error({ error, exchangeId }, "Failed to load markets")
    const message = error instanceof Error ? error.message : String(error)
    return new UnknownExchangeServiceError(message)
  }

  const listPrices = async ({
    timeframe,
    since,
    limit = 100,
  }: ExchangeListPricesArgs): Promise<ExchangePrice[] | ServiceError> => {
    try {
      if (!client.has.fetchOHLCV) return new OHLCVNotSupportedExchangeServiceError()

      const ohlc = await client.fetchOHLCV(symbol, timeframe, since, limit)
      if (!ohlc || !ohlc.length) return []

      return ohlc.map(exchangePriceFromRaw).filter(isExchangePrice)
    } catch (error) {
      baseLogger.error({ error }, "Ccxt unknown error")
      return new UnknownExchangeServiceError(error)
    }
  }

  return { listPrices }
}

const exchangePriceFromRaw = ([timestamp, , , , close]: OHLCV):
  | ExchangePrice
  | undefined => {
  if (!timestamp || !close) return undefined
  return {
    timestamp: toTimestamp(timestamp),
    price: toPrice(close),
  }
}

const isExchangePrice = (item: ExchangePrice | undefined): item is ExchangePrice => !!item
