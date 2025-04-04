import { sql } from 'drizzle-orm';
import { text, pgTable, serial, timestamp, json } from 'drizzle-orm/pg-core';

export const chats = pgTable('chats', {
  id: text('id').primaryKey(),
  userId: text('userid').notNull(), // user id from auth0
  title: text('title').notNull(),
  createdAt: text('createdat').notNull(),
  focusMode: text('focusmode').notNull(),
  files: json('files').$type<File[]>().default(sql`'[]'::json`),
});

export const messages = pgTable('messages', {
  id: serial('id').primaryKey(),
  content: text('content').notNull(),
  chatId: text('chatid').notNull(),
  messageId: text('messageid').notNull(),
  role: text('role').$type<'assistant' | 'user'>(), // no enum type helper yet, so we simulate it
  metadata: json('metadata'),
});

interface File {
  name: string;
  fileId: string;
}

