import * as SQLite from 'expo-sqlite';

const DATABASE_NAME = 'opera.db';

//one shared connection for all tables
let openPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function openSharedDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!openPromise) {
    openPromise = SQLite.openDatabaseAsync(DATABASE_NAME).catch((e) => {
      //retry next call on failure
      openPromise = null;
      throw e;
    });
  }
  return openPromise;
}
