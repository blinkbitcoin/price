import { InvalidExchangeProviderError } from "@domain/exchanges"

import { ExchangeFactory } from "@services/exchanges"

describe("ExchangeFactory", () => {
  let factory: ReturnType<typeof ExchangeFactory>

  beforeEach(() => {
    factory = ExchangeFactory()
  })

  describe("create", () => {
    it("returns an instance of IExchangeService when given valid config", async () => {
      const config: ExchangeConfig = {
        provider: "currencybeacon",
        name: "currencybeacon-btc",
        base: "BTC",
        quote: "USDT",
        quoteAlias: "",
        excludedQuotes: [],
        cron: "",
        config: { apiKey: "api-key" },
      }
      const result = await factory.create(config)
      expect(result).not.toBeInstanceOf(Error)
    })

    it("returns an instance of ExchangeServiceError when given invalid config", async () => {
      const config: ExchangeConfig = {
        provider: "invalid-provider",
        name: "binance",
        base: "BTC",
        quote: "USDT",
        quoteAlias: "",
        excludedQuotes: [],
        cron: "",
        config: {},
      }
      const result = await factory.create(config)
      expect(result).toBeInstanceOf(InvalidExchangeProviderError)
    })

    it("returns the same instance when given the same config twice", async () => {
      const config: ExchangeConfig = {
        provider: "currencybeacon",
        name: "currencybeacon-btc",
        base: "BTC",
        quote: "USDT",
        quoteAlias: "",
        excludedQuotes: [],
        cron: "",
        config: {},
      }
      const instance1 = await factory.create(config)
      const instance2 = await factory.create(config)
      expect(instance1).toStrictEqual(instance2)
    })

    it("creates an OpenExchangeRatesService instance with valid config", async () => {
      const config: ExchangeConfig = {
        provider: "openexchangerates",
        name: "openexchangerates",
        base: "USD",
        quote: "USDT",
        quoteAlias: "",
        excludedQuotes: [],
        cron: "",
        config: {
          apiKey: "mock-api-key",
          baseUrl: "https://openexchangerates.org/api",
          cacheSeconds: 1800,
        },
      }
      const result = await factory.create(config)
      const service = result as IExchangeService

      expect(result).not.toBeInstanceOf(Error)
      expect(typeof service.fetchTicker).toBe("function")
    })
  })
})
