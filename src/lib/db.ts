import { MongoClient, type Collection as MongoCollection, type Db } from "mongodb";
import type { Collection } from "./types";

declare global {
  var _mongoClientPromise: Promise<MongoClient> | undefined;
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

function getClientPromise(): Promise<MongoClient> {
  const uri = getUri();

  if (process.env.NODE_ENV === "development") {
    if (!global._mongoClientPromise) {
      const client = new MongoClient(uri);
      global._mongoClientPromise = client.connect();
    }
    return global._mongoClientPromise;
  }

  if (!global._mongoClientPromise) {
    const client = new MongoClient(uri);
    global._mongoClientPromise = client.connect();
  }
  return global._mongoClientPromise;
}

export async function getDb(): Promise<Db> {
  const client = await getClientPromise();
  return client.db("crypgo");
}

export async function getCollectionsCol(): Promise<MongoCollection<Collection>> {
  const db = await getDb();
  const col = db.collection<Collection>("collections");
  await col.createIndex({ id: 1 }, { unique: true, background: true });
  await col.createIndex({ slug: 1 }, { background: true });
  return col;
}
