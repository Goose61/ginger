import { MongoClient, type Collection as MongoCollection, type Db, type MongoClientOptions } from "mongodb";
import type { Collection } from "./types";

declare global {
  var _mongoClientPromise: Promise<MongoClient> | undefined;
  var _mongoIndexesPromise: Promise<void> | undefined;
}

function getUri(): string {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error(
      "MONGODB_URI is not set. Add it to your .env.local or Vercel project settings:\n" +
        "MONGODB_URI=mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/crypgo?retryWrites=true&w=majority",
    );
  }
  return uri;
}

/** Short timeouts + IPv4 avoid serverless TLS hangs on Atlas SRV. */
const mongoOptions: MongoClientOptions = {
  maxPoolSize: 5,
  minPoolSize: 0,
  maxIdleTimeMS: 30_000,
  serverSelectionTimeoutMS: 8_000,
  connectTimeoutMS: 8_000,
  socketTimeoutMS: 20_000,
  family: 4,
};

function connectClient(): Promise<MongoClient> {
  const client = new MongoClient(getUri(), mongoOptions);
  return client.connect().catch((err: unknown) => {
    global._mongoClientPromise = undefined;
    throw err;
  });
}

function getClientPromise(): Promise<MongoClient> {
  if (!global._mongoClientPromise) {
    global._mongoClientPromise = connectClient();
  }
  return global._mongoClientPromise;
}

export async function getDb(): Promise<Db> {
  const client = await getClientPromise();
  return client.db("crypgo");
}

function ensureIndexes(col: MongoCollection<Collection>): void {
  if (global._mongoIndexesPromise) return;
  global._mongoIndexesPromise = Promise.all([
    col.createIndex({ id: 1 }, { unique: true, background: true }),
    col.createIndex({ slug: 1 }, { background: true }),
  ])
    .then(() => undefined)
    .catch((err: unknown) => {
      global._mongoIndexesPromise = undefined;
      console.error("[mongo] index ensure failed", err);
    });
}

export async function getCollectionsCol(): Promise<MongoCollection<Collection>> {
  const db = await getDb();
  const col = db.collection<Collection>("collections");
  ensureIndexes(col);
  return col;
}
