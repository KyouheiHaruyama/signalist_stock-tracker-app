'use server';

import { connectToDatabase } from '@/database/mongoose';
import Watchlist from '@/database/models/watchlist.models';
import { ObjectId } from 'mongodb';

export async function getWatchlistSymbolsByEmail(email: string): Promise<string[]> {
  if (!email) return [];
  try {
    const mongoose = await connectToDatabase();
    const db = mongoose.connection.db;
    if (!db) throw new Error('Mongoose connection not connected');

    // Better Authのユーザーコレクションから検索
    const user = await db
      .collection('user')
      .findOne<{ _id?: ObjectId; id?: string; email?: string }>({ email });

    if (!user) return [];

    const userId = user.id ?? (user._id ? user._id.toString() : '');
    if (!userId) return [];

    const docs = await Watchlist.find({ userId }).select('symbol -_id').lean<{ symbol?: string }[]>();
    return docs
      .map((d) => (d.symbol ?? '').toString())
      .filter((s) => typeof s === 'string' && s.length > 0);
  } catch (error) {
    console.error('Error fetching watchlist symbols by email:', error);
    return [];
  }
}
