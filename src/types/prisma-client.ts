// src/types/prisma-client.ts

/**
 * The Prisma surface this package actually touches.
 *
 * The generated client is produced per consumer, so there is no root
 * `PrismaClient` declaration to import here: this package is compiled and
 * published before any consumer runs `prisma generate`. What it needs is the
 * two delegate methods the reader calls and the two lifecycle methods, so that
 * is what it names.
 */

export interface EAVDatabaseRow {
  id: string;
  slug: string;
  definition: string; // JSON string (default structure)
  [key: string]: unknown; // Allow custom columns
}

export interface EAVModelDelegate {
  findMany(): Promise<EAVDatabaseRow[]>;
  findFirst(args: { where: { slug: string } }): Promise<EAVDatabaseRow | null>;
}

/**
 * `$disconnect` is the only lifecycle call the reader and generator make;
 * `$connect` belongs to the CLI loader that opens the connection, so it is
 * required there and not here.
 */
export interface EAVPrismaClient {
  $disconnect(): Promise<void>;
}

function isEAVModelDelegate(value: unknown): value is EAVModelDelegate {
  if (typeof value !== 'object' || value === null) return false;
  if (!('findMany' in value) || !('findFirst' in value)) return false;
  return typeof value.findMany === 'function' && typeof value.findFirst === 'function';
}

/**
 * Delegates are looked up by a name that only exists at runtime (the configured
 * table), so `EAVPrismaClient` cannot declare them. Reflect.get plus this guard
 * is the honest replacement for indexing an `any`: a missing or misnamed table
 * fails here with the table name in the message instead of as
 * "Cannot read properties of undefined" several frames later.
 */
export function getModelDelegate(
  client: EAVPrismaClient,
  tableName: string
): EAVModelDelegate {
  const candidate: unknown = Reflect.get(client, tableName);

  if (!isEAVModelDelegate(candidate)) {
    throw new Error(
      `Prisma client has no model delegate named "${tableName}" with findMany/findFirst`
    );
  }

  return candidate;
}
