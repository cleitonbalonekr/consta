/** A count as lawyers read it: 3.600, not 3600. */
export function formatNumber(value: number) {
  return value.toLocaleString("pt-BR");
}

/** A provider cost in dollars, to the tenth of a cent and below: US$ 0,0125. */
export function formatUsd(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 });
}
