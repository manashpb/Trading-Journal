export function calculateLeg(leg: any): { realised: number; openQuantity: number; averageEntry: number; costs: number; unrealised: number | null };
export function calculateStrategy(legs: any[], additionalCosts?: number): { grossRealised: number; costs: number; netRealised: number; allClosed: boolean; unrealised: number | null };
