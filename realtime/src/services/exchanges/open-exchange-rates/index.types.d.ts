type OpenExchangeRatesConfig = { [k: string]: string | number | boolean }
type OpenExchangeRatesRates = { [code: string]: number }

interface GetOpenExchangeRatesResponse {
  timestamp: number
  base: string
  rates: OpenExchangeRatesRates
}

type OpenExchangeRatesServiceArgs = {
  base: string
  quote: string
  config?: OpenExchangeRatesConfig
}
