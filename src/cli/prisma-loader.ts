// src/cli/prisma-loader.ts

import type { EAVPrismaClient } from '../types/prisma-client';

/**
 * The generated client is produced per consumer, so `PrismaClient` cannot be
 * imported as a type here — it may not exist at this package's compile time.
 * The constructor is resolved at runtime from the consumer's own
 * `@prisma/client` and checked against the surface this package uses.
 */
type ConnectablePrismaClient = EAVPrismaClient & {
  $connect(): Promise<void>;
};

type PrismaClientConstructor = new (options: {
  datasources: { db: { url: string } };
}) => ConnectablePrismaClient;

function exportsPrismaClient(
  module: unknown
): module is { PrismaClient: PrismaClientConstructor } {
  if (typeof module !== 'object' || module === null) return false;
  if (!('PrismaClient' in module)) return false;
  return typeof module.PrismaClient === 'function';
}

/**
 * Create Prisma client from connection string
 *
 * Note: This assumes the user has Prisma set up for their EAV database.
 * The connection string should point to their existing database.
 */
export async function createPrismaClient(
  connectionString: string
): Promise<ConnectablePrismaClient> {
  // Extract datasource URL from connection string
  let datasourceUrl = connectionString;

  // If it's already an env() reference, resolve it
  if (connectionString.startsWith('env(')) {
    const envVar = connectionString.match(/env\("(.+)"\)/)?.[1];
    const resolved = envVar ? process.env[envVar] : undefined;
    if (resolved) {
      datasourceUrl = resolved;
    }
  }

  const module: unknown = await import('@prisma/client');

  if (!exportsPrismaClient(module)) {
    throw new Error(
      'Could not load PrismaClient from "@prisma/client". Run `npx prisma generate` first.'
    );
  }

  const prisma = new module.PrismaClient({
    datasources: {
      db: {
        url: datasourceUrl
      }
    }
  });

  // Test connection
  try {
    await prisma.$connect();
  } catch (error) {
    throw new Error(`Failed to connect to database: ${(error as Error).message}`);
  }

  return prisma;
}
