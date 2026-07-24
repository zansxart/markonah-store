import fs from 'fs'
import path from 'path'

const ROOT_DIR = path.resolve('./')
const STORAGE_ASSET_DIR = path.join(ROOT_DIR, 'storage', 'assets')
const LEGACY_ASSET_DIR = path.join(ROOT_DIR, 'src')

function normalizeRelativePath(value) {
  return String(value || '')
    .replace(/^[./\\]+/, '')
    .replace(/[\\/]+/g, path.sep)
}

export function resolveAssetPath(relativePath, legacyRelativePath = relativePath) {
  const nextPath = path.join(STORAGE_ASSET_DIR, normalizeRelativePath(relativePath))
  const legacyPath = path.join(LEGACY_ASSET_DIR, normalizeRelativePath(legacyRelativePath))

  if (fs.existsSync(nextPath) || !fs.existsSync(legacyPath)) return nextPath
  return legacyPath
}
