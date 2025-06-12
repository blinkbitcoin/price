import axios from "axios"

import { toPrice, toTimestamp } from "@domain/primitives"
import {
  InvalidExchangeConfigError,
  UnknownExchangeServiceError,
} from "@domain/exchanges"

import * as LocalCacheServiceImpl from "@services/cache"
import { OpenExchangeRatesService } from "@services/exchanges/open-exchange-rates"

jest.mock("axios")

const mockAxiosResponse = {
  data: {
    rates: {
      EUR: 0.92,
      COP: 3940.15,
    },
    timestamp: Math.floor(Date.now() / 1000),
  },
  status: 200,
}

describe("OpenExchangeRatesService", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("should return InvalidExchangeConfigError if apiKey is missing", async () => {
    const service = await OpenExchangeRatesService({
      base: "USD",
      quote: "EUR",
      config: undefined,
    })
    expect(service).toBeInstanceOf(InvalidExchangeConfigError)
  })

  it("should return UnknownExchangeServiceError if axios responds with status >= 400", async () => {
    ;(axios.get as jest.Mock).mockResolvedValue({
      status: 400,
      data: {},
    })

    jest.spyOn(LocalCacheServiceImpl, "LocalCacheService").mockImplementation(() => ({
      get: async () => Promise.resolve(new Error("not cached")),
      set: jest.fn(),
      getOrSet: jest.fn(),
      clear: jest.fn(),
    }))

    const service = await OpenExchangeRatesService({
      base: "USD",
      quote: "EUR",
      config: { apiKey: "test" },
    })

    if (service instanceof Error) throw service

    const result = await service.fetchTicker()
    expect(result).toBeInstanceOf(UnknownExchangeServiceError)
  })

  it("should return UnknownExchangeServiceError if response is malformed", async () => {
    ;(axios.get as jest.Mock).mockResolvedValue({ data: {}, status: 200 })

    jest.spyOn(LocalCacheServiceImpl, "LocalCacheService").mockImplementation(() => ({
      get: () => Promise.resolve(new Error()),
      set: jest.fn(),
      getOrSet: jest.fn(),
      clear: jest.fn(),
    }))

    const service = await OpenExchangeRatesService({
      base: "USD",
      quote: "EUR",
      config: { apiKey: "test" },
    })
    if (service instanceof Error) throw service

    const result = await service.fetchTicker()
    expect(result).toBeInstanceOf(UnknownExchangeServiceError)
  })

  it("should return ticker if API responds correctly", async () => {
    ;(axios.get as jest.Mock).mockResolvedValue(mockAxiosResponse)

    jest.spyOn(LocalCacheServiceImpl, "LocalCacheService").mockImplementation(() => ({
      get: () => Promise.resolve(new Error()),
      set: jest.fn(),
      getOrSet: jest.fn(),
      clear: jest.fn(),
    }))

    const service = await OpenExchangeRatesService({
      base: "USD",
      quote: "EUR",
      config: { apiKey: "test" },
    })
    if (service instanceof Error) throw service

    const result = await service.fetchTicker()
    expect(result).toEqual({
      bid: toPrice(0.92),
      ask: toPrice(0.92),
      timestamp: toTimestamp(expect.any(Number)),
    })
  })

  it("should use cached rates if available", async () => {
    jest.spyOn(LocalCacheServiceImpl, "LocalCacheService").mockImplementation(() => ({
      get: <T>() => Promise.resolve({ EUR: 0.92 } as T),
      set: jest.fn(),
      getOrSet: jest.fn(),
      clear: jest.fn(),
    }))

    const service = await OpenExchangeRatesService({
      base: "USD",
      quote: "EUR",
      config: { apiKey: "test" },
    })
    if (service instanceof Error) throw service

    const result = await service.fetchTicker()
    expect(result).toEqual({
      bid: toPrice(0.92),
      ask: toPrice(0.92),
      timestamp: toTimestamp(expect.any(Number)),
    })
  })
})
