// Display-formatting helpers for miles, USD, and durations. Always US-centric (mi, USD, h/m).

export function formatMiles(miles: number): string {
  if (!Number.isFinite(miles)) return "—";
  if (miles >= 100) return `${Math.round(miles)} mi`;
  return `${miles.toFixed(1)} mi`;
}

export function formatUSD(amount: number): string {
  if (!Number.isFinite(amount)) return "—";
  if (amount >= 100) return `$${Math.round(amount)}`;
  return `$${amount.toFixed(2)}`;
}

export function formatETA(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes < 0) return "—";
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes - hours * 60);
  if (hours === 0) return `${mins}m`;
  return `${hours}h ${mins}m`;
}

export function formatHours(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes < 0) return "—";
  return `${(minutes / 60).toFixed(1)}h`;
}

export function formatGallons(gallons: number): string {
  if (!Number.isFinite(gallons)) return "—";
  return `${gallons.toFixed(1)} gal`;
}

export function formatPricePerGallon(price: number): string {
  if (!Number.isFinite(price)) return "—";
  return `$${price.toFixed(2)}/gal`;
}
