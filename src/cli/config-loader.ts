// src/cli/config-loader.ts

import { ConfigSchema } from '../types/config';
import type { Config } from '../types/config';
import { pathToFileURL } from 'url';
import path from 'path';

function isModuleNotFoundError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) return false;
  return error.code === 'MODULE_NOT_FOUND' || error.code === 'ERR_MODULE_NOT_FOUND';
}

/**
 * Load and validate config file
 */
export async function loadConfig(configPath: string): Promise<Config> {
  try {
    const absolutePath = path.resolve(process.cwd(), configPath);
    
    // Dynamic import using file URL (works with both ESM and CJS)
    const fileUrl = pathToFileURL(absolutePath).href;
    const module = await import(fileUrl);
    
    const config = module.default || module;
    
    // Validate with Zod
    const validated = ConfigSchema.parse(config);
    
    return validated;
  } catch (error) {
    if (isModuleNotFoundError(error)) {
      throw new Error(
        `Config file not found: ${configPath}\nRun 'eav-to-prisma init' to create one.`
      );
    }
    
    throw new Error(`Failed to load config: ${(error as Error).message}`);
  }
}