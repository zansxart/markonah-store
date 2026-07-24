import path from 'path'
import { createRequire } from 'module'
import { pathToFileURL } from 'url'

function isFileSystemPath(modulePath) {
  return path.isAbsolute(modulePath) || /^[./\\]/.test(modulePath)
}

function toImportSpecifier(modulePath) {
  if (!isFileSystemPath(modulePath) || /^(?:node|data|file):|^[a-z]+:\/\//i.test(modulePath)) {
    return modulePath
  }

  const [filePath, query = ''] = modulePath.split('?')
  const specifier = pathToFileURL(path.resolve(filePath)).href
  return query ? `${specifier}?${query}` : specifier
}

export async function importModule(modulePath) {
  const specifier = toImportSpecifier(modulePath)
  try {
    const mod = await import(specifier)
    return mod && mod.__esModule ? (mod.default || mod) : mod
  } catch (err) {
    const requirePath = modulePath.split('?')[0]
    if (isFileSystemPath(requirePath) && !/\.cjs$/i.test(requirePath)) {
      throw err
    }

    const require = createRequire(import.meta.url)
    const resolved = require.resolve(requirePath)
    if (require.cache[resolved]) {
      delete require.cache[resolved]
    }
    return require(requirePath)
  }
}
