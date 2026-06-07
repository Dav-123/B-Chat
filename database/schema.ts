/**
 * schema.ts — Thin shim retained for backward compatibility.
 * All schema creation and migration is managed by DatabaseService.
 * Callers should use DatabaseService.initialize() directly.
 */
export { DatabaseService } from '@/database/DatabaseService';

export async function initializeSchema(): Promise<void> {
  const { DatabaseService } = await import('@/database/DatabaseService');
  await DatabaseService.initialize();
}