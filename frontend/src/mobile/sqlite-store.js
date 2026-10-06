const DATABASE_NAME = 'xitolinos-mobile';
const DATABASE_VERSION = 1;

let databasePromise;
let writeQueue = Promise.resolve();

async function openDatabase() {
  if (databasePromise) return databasePromise;

  databasePromise = (async () => {
    const { Capacitor } = await import('@capacitor/core');
    if (!Capacitor.isNativePlatform()) {
      throw new Error('O armazenamento SQLite está disponível somente no aplicativo Android.');
    }

    const { CapacitorSQLite, SQLiteConnection } = await import('@capacitor-community/sqlite');
    const sqlite = new SQLiteConnection(CapacitorSQLite);
    await sqlite.checkConnectionsConsistency();

    const existing = await sqlite.isConnection(DATABASE_NAME, false);
    const database = existing.result
      ? await sqlite.retrieveConnection(DATABASE_NAME, false)
      : await sqlite.createConnection(DATABASE_NAME, false, 'no-encryption', DATABASE_VERSION, false);

    if (!(await database.isDBOpen()).result) await database.open();

    const versionResult = await database.getVersion();
    const version = Number(versionResult.version || 0);
    if (version > DATABASE_VERSION) {
      throw new Error('O banco deste aplicativo foi criado por uma versão mais recente. Atualize o Xitolinos antes de continuar.');
    }

    if (version < 1) {
      await database.execute(`
        CREATE TABLE IF NOT EXISTS mobile_state (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          state_json TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        PRAGMA user_version = 1;
      `);
    }

    return database;
  })().catch(error => {
    databasePromise = null;
    throw error;
  });

  return databasePromise;
}

export async function readMobileState() {
  const database = await openDatabase();
  const result = await database.query('SELECT state_json FROM mobile_state WHERE id = 1');
  const serialized = result.values?.[0]?.state_json;
  return serialized ? JSON.parse(serialized) : null;
}

export async function writeMobileState(state) {
  const nextWrite = writeQueue.then(async () => {
    const database = await openDatabase();
    const timestamp = new Date().toISOString();
    await database.run(
      `INSERT INTO mobile_state (id, state_json, updated_at)
       VALUES (1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at`,
      [JSON.stringify(state), timestamp],
      true
    );
  });

  writeQueue = nextWrite.catch(() => {});
  await nextWrite;
}

export async function updateMobileState(update) {
  const nextWrite = writeQueue.then(async () => {
    const database = await openDatabase();
    const result = await database.query('SELECT state_json FROM mobile_state WHERE id = 1');
    const serialized = result.values?.[0]?.state_json;
    const current = serialized ? JSON.parse(serialized) : null;
    const next = await update(current);
    await database.run(
      `INSERT INTO mobile_state (id, state_json, updated_at)
       VALUES (1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at`,
      [JSON.stringify(next), new Date().toISOString()],
      true
    );
    return next;
  });

  writeQueue = nextWrite.catch(() => {});
  return nextWrite;
}
