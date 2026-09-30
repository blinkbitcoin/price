import { createTask, ScheduledTask } from "node-cron"

import { getExchangesConfig, supportedCurrencies } from "@config"

import { refreshRealtimeData } from "./refresh-realtime-data"

export const startWatchers = async (
  callback?: RefreshDataCallback,
): Promise<ScheduledTask[]> => {
  const exchanges = getExchangesConfig()
  const start: Promise<ScheduledTask>[] = []

  for (const currency of supportedCurrencies) {
    const supportedExchanges = exchanges.filter((e) => e.quoteAlias === currency.code)
    for (const exchange of supportedExchanges) {
      start.push(startWatcher({ currency: currency.code, exchange, callback }))
    }
  }
  return Promise.all(start)
}

const startWatcher = async ({
  currency,
  exchange,
  callback,
}: {
  currency: CurrencyCode
  exchange: DevExchangeConfig | ExchangeConfig
  callback?: RefreshDataCallback
}): Promise<ScheduledTask> => {
  const task = async () => {
    const ticker = await refreshRealtimeData({ currency, exchange })
    if (!callback) return

    if (ticker instanceof Error) {
      callback(ticker)
      return
    }

    callback(null, { exchangeName: exchange.name, ticker })
  }
  const scheduledTask = createTask(exchange.cron, task)
  await task()
  scheduledTask.start()
  return scheduledTask
}
