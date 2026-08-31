/**
 * Jest Global Setup: Compile AL test fixtures on demand
 *
 * This script runs once before all test suites. It checks if the compiled
 * .app symbol packages exist in tests/fixtures/compiled/ and compiles them
 * from the AL source projects if missing.
 *
 * Requires the AL CLI (installed via dotnet tool). If AL is not available,
 * compilation is skipped and tests that need fixtures will skip gracefully.
 */

import { spawn } from 'child_process';
import * as path from 'path';
import { promises as fs } from 'fs';
import { ALInstaller } from '../../src/cli/al-installer';

const FIXTURES_DIR = path.resolve(__dirname);
const COMPILED_DIR = path.join(FIXTURES_DIR, 'compiled');
const BASE_APP_DIR = path.join(FIXTURES_DIR, 'base-app');
const EXT_APP_DIR = path.join(FIXTURES_DIR, 'ext-app');

const BASE_APP_OUTPUT = path.join(COMPILED_DIR, 'TestPublisher_Base Test App_1.0.0.0.app');
const EXT_APP_OUTPUT = path.join(COMPILED_DIR, 'TestPublisher_Extension Test App_1.0.0.0.app');

// Raw compiled apps (pre-CreateSymbolPackage) embed source under src/ - kept as a
// source-bearing fixture for al_get_object_source tests instead of being deleted.
export const BASE_APP_RAW_OUTPUT = path.join(COMPILED_DIR, 'base-raw.app');
export const EXT_APP_RAW_OUTPUT = path.join(COMPILED_DIR, 'ext-raw.app');

function execAL(alPath: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(alPath, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (data) => { stdout += data.toString(); });
    proc.stderr?.on('data', (data) => { stderr += data.toString(); });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`AL command failed (exit ${code}): ${stderr || stdout}`));
      }
    });

    proc.on('error', (error) => {
      reject(new Error(`Failed to spawn AL: ${error.message}`));
    });

    setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error('AL command timed out after 60s'));
    }, 60000);
  });
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function compileFixtures(): Promise<void> {
  // Check if compiled files already exist
  if (await fileExists(BASE_APP_OUTPUT) && await fileExists(EXT_APP_OUTPUT) &&
      await fileExists(BASE_APP_RAW_OUTPUT) && await fileExists(EXT_APP_RAW_OUTPUT)) {
    return;
  }

  console.log('[compile-fixtures] Compiled fixtures missing, attempting to build...');

  // Ensure AL CLI is available
  const installer = new ALInstaller();
  const result = await installer.ensureALAvailable();

  if (!result.success) {
    console.warn(`[compile-fixtures] AL CLI not available: ${result.message}`);
    console.warn('[compile-fixtures] Extension object tests will be skipped.');
    return;
  }

  const alPath = result.alPath!;
  console.log(`[compile-fixtures] Using AL CLI: ${result.message}`);

  // Create output directory
  await fs.mkdir(COMPILED_DIR, { recursive: true });

  // Ensure .alpackages directories exist
  await fs.mkdir(path.join(BASE_APP_DIR, '.alpackages'), { recursive: true });
  await fs.mkdir(path.join(EXT_APP_DIR, '.alpackages'), { recursive: true });

  // Step 1: Compile base app
  console.log('[compile-fixtures] Compiling base app...');
  await execAL(alPath, [
    'compile',
    `/project:${BASE_APP_DIR}`,
    `/packagecachepath:${path.join(BASE_APP_DIR, '.alpackages')}`,
    `/out:${BASE_APP_RAW_OUTPUT}`
  ]);

  // Step 2: Create symbol package from base app
  console.log('[compile-fixtures] Creating base app symbol package...');
  await execAL(alPath, ['CreateSymbolPackage', BASE_APP_RAW_OUTPUT, BASE_APP_OUTPUT]);

  // Step 3: Copy base app symbol package to ext-app's .alpackages (it depends on it)
  await fs.copyFile(BASE_APP_OUTPUT, path.join(EXT_APP_DIR, '.alpackages', path.basename(BASE_APP_OUTPUT)));

  // Step 4: Compile extension app
  console.log('[compile-fixtures] Compiling extension app...');
  await execAL(alPath, [
    'compile',
    `/project:${EXT_APP_DIR}`,
    `/packagecachepath:${path.join(EXT_APP_DIR, '.alpackages')}`,
    `/out:${EXT_APP_RAW_OUTPUT}`
  ]);

  // Step 5: Create symbol package from extension app
  console.log('[compile-fixtures] Creating extension app symbol package...');
  await execAL(alPath, ['CreateSymbolPackage', EXT_APP_RAW_OUTPUT, EXT_APP_OUTPUT]);

  // Note: the raw .app files (BASE_APP_RAW_OUTPUT/EXT_APP_RAW_OUTPUT) are kept -
  // they embed source under src/ and are used as a source-bearing test fixture.

  console.log('[compile-fixtures] Fixture compilation complete.');
}

export default async function globalSetup(): Promise<void> {
  await compileFixtures();
}
