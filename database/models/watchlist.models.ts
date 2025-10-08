import { Schema, model, models, Document, Model } from 'mongoose';

export interface WatchlistItem extends Document {
  userId: string;
  symbol: string;
  company: string;
  addedAt: Date;
}

const WatchlistSchema = new Schema<WatchlistItem>(
  {
    userId: { type: String, required: true, index: true, trim: true },
    symbol: { type: String, required: true, uppercase: true, trim: true },
    company: { type: String, required: true, trim: true },
    addedAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

// 同一ユーザーが同じ銘柄を重複登録できないように複合ユニークインデックス
WatchlistSchema.index({ userId: 1, symbol: 1 }, { unique: true });

const Watchlist: Model<WatchlistItem> =
  (models?.Watchlist as Model<WatchlistItem> | undefined) ||
  model<WatchlistItem>('Watchlist', WatchlistSchema);

export default Watchlist;