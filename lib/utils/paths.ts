import path from 'path';

export function getDataDir(): string {
  const envPath = process.env.PROFFLOW_DATA_DIR;
  if (envPath) {
    if (envPath.startsWith('~/')) {
      return path.join(process.env.HOME || '', envPath.slice(2));
    }
    return envPath;
  }
  return path.join(process.env.HOME || process.cwd(), 'ProfFlow', 'data');
}
