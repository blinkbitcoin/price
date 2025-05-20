export const isDefined = <T>(item: T | undefined): item is T => {
  return !!item
}

export const median = (arr) => {
  const arr_ = arr.filter((n) => !!n)
  const mid = Math.floor(arr_.length / 2),
    nums = [...arr_].sort((a, b) => a - b)
  return arr_.length % 2 !== 0 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2
}

export const assertUnreachable = (x: never): never => {
  throw new Error(`This should never compile with ${x}`)
}

export const round = (number: number): number =>
  +(Math.round(Number(number + "e+2")) + "e-2")

export const unixTimestamp = (date: Date) => Math.floor(date.getTime() / 1000)

export const isRatesObjectValid = <T extends RatesObject>(rates: unknown): rates is T => {
  if (!rates || typeof rates !== "object" || Array.isArray(rates)) return false

  let keyCount = 0
  for (const key in rates) {
    const value = (rates as Record<string, unknown>)[key]
    if (typeof key !== "string" || typeof value !== "number") {
      return false
    }
    keyCount++
  }

  return !!keyCount
}

export const cleanRatesObject = (rates: unknown): RatesObject => {
  if (!rates || typeof rates !== "object") return {}

  return Object.entries(rates).reduce((cleaned, [key, value]) => {
    // Handle string conversion
    if (typeof value === "string") {
      const parsed = parseFloat(value)
      if (!isNaN(parsed) && isFinite(parsed)) {
        cleaned[key] = parsed
      }
    }
    // Handle direct number values
    else if (typeof value === "number" && !isNaN(value) && isFinite(value)) {
      cleaned[key] = value
    }

    return cleaned
  }, {} as RatesObject)
}
