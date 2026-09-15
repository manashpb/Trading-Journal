export type TradeDirection = 'Long' | 'Short';
export type ContractType = 'CFD' | 'Futures';
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

export interface Trade {
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