export type TradeDirection = 'Long' | 'Short';
export type ContractType = 'CFD' | 'Futures' | 'Option' | 'Equity';
export type TradeStatus = 'Open' | 'Closed';

export interface Tag {
  id: number;
  categoryId: number;
  name: string;
  createdAt?: string;
}

export interface TagCategory {
  id: number;
  name: string;
  tags: Tag[];
  createdAt?: string;
}

export interface Instrument {
  id: number;
  name: string;
  type: ContractType;
  pointValue: number;
  createdAt?: string;
}

export interface Snapshot {
  id: number;
  tradeId: number;
  filePath: string;
  createdAt?: string;
}

export interface AnalysisField { key: string; label: string; type: 'text' | 'number' | 'select'; options?: string[]; }
export interface TradeProfile { id: string; name: string; holdingStyles: string[]; fields: AnalysisField[]; version: number; }
export interface Execution { action:'Entry' | 'Exit'; time:string; quantity:number; price:number; costs:number; }
export interface Leg { entryDateTime?: string; exitDateTime?: string; executions?:Execution[]; markPrice?:number | null; symbol: string; assetType: string; side: 'Buy' | 'Sell'; expiry: string; strike: number | null; optionType: string; quantity: number; multiplier: number; entryPrice: number; exitPrice: number | null; }
export interface Framework { optionType?: 'CE' | 'PE' | ''; strike?: number | null; delta?: number | null; templateVersion: number; fields: AnalysisField[]; analysis: Record<string, string | number>; observedAt: string; source: string; thesis: string; exitReason: string; review: string; adjustments: string; legs: Leg[]; }
export interface Trade {
  realisedPnl?:number | null; unrealisedPnl?:number | null; totalCosts?:number;
  profile?: string; holdingStyle?: string; assetType?: string; account?: string; strategy?: string;
  capitalCommitted?: number | null; plannedRisk?: number | null; costs?: number; grossPnl?: number | null; multiplier?: number; framework?: Framework;
  id: number;
  instrumentId: number;
  instrumentName?: string;
  pointValue?: number;
  direction: TradeDirection;
  contractType: ContractType;
  entryDateTime: string;
  entryPrice: number;
  slPrice: number | null;
  targetPrice: number | null;
  quantity: number;
  exitDateTime: string | null;
  exitPrice: number | null;
  status: TradeStatus;
  pnl: number | null;
  tags: number[];
  tagNames?: string[];
  comments: string;
  snapshots?: Snapshot[];
  firstSnapshot?: string;
  snapshotCount?: number;
  snapshotPaths?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface TradeFilters {
  startDate: string | null;
  endDate: string | null;
  status: TradeStatus | '';
  contractType: ContractType | '';
  instrumentId: number | '';
  tagIds: number[];
  search: string;
}

export interface PnlItem {
  tradeId: number;
  date: string; // YYYY-MM-DD
  pnl: number;
  instrumentName?: string;
}
