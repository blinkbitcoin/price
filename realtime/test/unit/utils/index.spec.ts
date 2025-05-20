import {
  isDefined,
  median,
  assertUnreachable,
  round,
  unixTimestamp,
  isRatesObjectValid,
  cleanRatesObject,
} from "@utils"

describe("isDefined", () => {
  it("should return true for defined values", () => {
    expect(isDefined([])).toBe(true)
    expect(isDefined({})).toBe(true)
  })

  it("should return false for false values", () => {
    expect(isDefined(undefined)).toBe(false)
    expect(isDefined(0)).toBe(false)
    expect(isDefined("")).toBe(false)
    expect(isDefined(false)).toBe(false)
    expect(isDefined(null)).toBe(false)
  })
})

describe("median", () => {
  it("should calculate median correctly for odd-length arrays", () => {
    expect(median([2, 1, 5])).toBe(2)
    expect(median([7, 3, 1, 9, 5])).toBe(5)
  })

  it("should calculate median correctly for even-length arrays", () => {
    expect(median([2, 1])).toBe(1.5)
    expect(median([1, 3, 5, 7])).toBe(4)
  })

  it("should handle arrays with undefined values", () => {
    expect(median([2, 1, undefined])).toBe(1.5)
    expect(median([2, 1, undefined, 5])).toBe(2)
    expect(median([undefined, undefined, 5])).toBe(5)
  })

  it("should handle empty arrays", () => {
    expect(median([])).toBeNaN() // Empty array should return NaN
  })

  it("should handle arrays with only undefined values", () => {
    expect(median([undefined, undefined])).toBeNaN()
  })
})

describe("assertUnreachable", () => {
  it("should throw an error with the correct message", () => {
    expect(() => {
      assertUnreachable("test" as never)
    }).toThrow("This should never compile with test")
  })
})

describe("round", () => {
  it("should round numbers to 2 decimal places", () => {
    expect(round(1.234)).toBe(1.23)
    expect(round(1.235)).toBe(1.24) // Tests normal rounding behavior
    expect(round(1.5)).toBe(1.5)
  })

  it("should handle integer values", () => {
    expect(round(5)).toBe(5)
    expect(round(0)).toBe(0)
  })

  it("should handle negative values", () => {
    expect(round(-1.234)).toBe(-1.23)
    expect(round(-1.237)).toBe(-1.24)
  })
})

describe("unixTimestamp", () => {
  it("should convert Date objects to Unix timestamps", () => {
    // January 1, 1970, 00:00:00 UTC is 0 in Unix time
    expect(unixTimestamp(new Date(0))).toBe(0)

    // Create a specific date for testing
    const testDate = new Date("2023-01-01T00:00:00Z")
    const expectedTimestamp = Math.floor(testDate.getTime() / 1000)
    expect(unixTimestamp(testDate)).toBe(expectedTimestamp)
  })
})

describe("isRatesObjectValid", () => {
  it("should return true for valid rates objects", () => {
    const validRates = {
      USD: 1,
      EUR: 0.85,
      GBP: 0.72,
    }
    expect(isRatesObjectValid(validRates)).toBe(true)
  })

  it("should return false for objects with non-number values", () => {
    const invalidRates = {
      USD: 1,
      EUR: "0.85",
      GBP: 0.72,
    }
    expect(isRatesObjectValid(invalidRates)).toBe(false)
  })

  it("should return false for empty objects", () => {
    expect(isRatesObjectValid({})).toBe(false)
  })

  it("should return false for non-object values", () => {
    expect(isRatesObjectValid(null)).toBe(false)
    expect(isRatesObjectValid(undefined)).toBe(false)
    expect(isRatesObjectValid("rates")).toBe(false)
    expect(isRatesObjectValid(123)).toBe(false)
    expect(isRatesObjectValid([1, 2, 3])).toBe(false)
  })
})

describe("cleanRatesObject", () => {
  it("should convert string numbers to actual numbers", () => {
    const mixedRates = {
      USD: 1,
      EUR: "0.85",
      GBP: 0.72,
    }

    const expected = {
      USD: 1,
      EUR: 0.85,
      GBP: 0.72,
    }

    expect(cleanRatesObject(mixedRates)).toEqual(expected)
  })

  it("should filter out non-numeric values", () => {
    const dirtyRates = {
      USD: 1,
      EUR: "invalid",
      GBP: NaN,
      JPY: Infinity,
      PEN: null,
      CAD: 1.3,
    }

    const expected = {
      USD: 1,
      CAD: 1.3,
    }

    expect(cleanRatesObject(dirtyRates)).toEqual(expected)
  })

  it("should return an empty object for non-object inputs", () => {
    expect(cleanRatesObject(null)).toEqual({})
    expect(cleanRatesObject(undefined)).toEqual({})
    expect(cleanRatesObject("rates")).toEqual({})
    expect(cleanRatesObject(123)).toEqual({})
  })

  it("should handle empty objects", () => {
    expect(cleanRatesObject({})).toEqual({})
  })
})
