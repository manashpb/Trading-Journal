/** Weighted average cost accounting. Executions are ordered by their timestamp. */
export function calculateLeg(leg) {
  const sign = leg.side === 'Buy' ? 1 : -1;
  if (!leg.executions?.length) {
    return { realised: leg.exitPrice == null ? 0 : (leg.exitPrice - leg.entryPrice) * sign * leg.quantity * leg.multiplier,
      openQuantity: leg.exitPrice == null ? leg.quantity : 0, averageEntry: leg.entryPrice, costs: 0,
      unrealised: leg.exitPrice == null && leg.markPrice != null ? (leg.markPrice - leg.entryPrice) * sign * leg.quantity * leg.multiplier : null };
  }
  let openQuantity = 0, averageEntry = 0, realised = 0, costs = 0;
  for (const fill of [...leg.executions].sort((a, b) => Date.parse(a.time) - Date.parse(b.time))) {
    costs += fill.costs || 0;
    if (fill.action === 'Entry') {
      averageEntry = (averageEntry * openQuantity + fill.price * fill.quantity) / (openQuantity + fill.quantity);
      openQuantity += fill.quantity;
    } else {
      if (fill.quantity > openQuantity + 1e-8) throw new Error('Exit quantity exceeds the open quantity');
      realised += (fill.price - averageEntry) * sign * fill.quantity * leg.multiplier;
      openQuantity = Math.max(0, openQuantity - fill.quantity);
    }
  }
  return { realised, openQuantity, averageEntry, costs,
    unrealised: openQuantity === 0 ? 0 : leg.markPrice == null ? null : (leg.markPrice - averageEntry) * sign * openQuantity * leg.multiplier };
}

export function calculateStrategy(legs, additionalCosts = 0) {
  const results = legs.map(calculateLeg);
  const grossRealised = results.reduce((sum, r) => sum + r.realised, 0);
  const costs = results.reduce((sum, r) => sum + r.costs, additionalCosts);
  return { grossRealised, costs, netRealised: grossRealised - costs,
    allClosed: results.every(r => r.openQuantity === 0),
    unrealised: results.every(r => r.unrealised != null) ? results.reduce((sum, r) => sum + r.unrealised, 0) : null };
}
