import { JTDDataType } from "ajv/dist/types/jtd-schema"

export type ConfigSchema = JTDDataType<typeof import("./schema").configSchema>

export const configSchema = {
  type: "object",
  properties: {
    base: { type: "string" },
    quotes: {
      type: "array",
      uniqueItems: true,
      items: {
        type: "object",
        properties: {
          code: { type: "string" },
          symbol: { type: "string" },
          name: { type: "string" },
          flag: { type: "string", default: "" },
          fractionDigits: { type: "integer", minimum: 0, maximum: 4, default: 2 },
        },
        required: ["code", "symbol", "name"],
        additionalProperties: false,
      },
    },
    exchanges: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          enabled: { type: "boolean", default: false },
          quoteAlias: {
            anyOf: [{ type: "string" }, { type: "array", items: { type: "string" } }],
            default: "*",
          },
          base: { type: "string", default: "BTC" },
          quote: {
            anyOf: [{ type: "string" }, { type: "array", items: { type: "string" } }],
            default: "*",
          },
          excludedQuotes: {
            anyOf: [{ type: "string" }, { type: "array", items: { type: "string" } }],
          },
          provider: {
            type: "string",
            enum: [
              "dev-mock",
              "ccxt",
              "free-currency-rates",
              "currencybeacon",
              "exchangeratesapi",
              "exchangeratehost",
              "yadio",
              "openexchangerates",
            ],
          },
          cron: { type: "string" },
          config: { type: "object" },
        },
        required: ["name", "base", "quote", "provider", "cron"],
        additionalProperties: false,
      },
      uniqueItems: true,
    },
  },
  required: ["base", "quotes", "exchanges"],
  additionalProperties: false,
} as const
