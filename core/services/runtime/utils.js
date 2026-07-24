import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { platform } from 'process'

export function getFilename(pathURL = import.meta.url, rmPrefix = platform !== 'win32') {
  const isFileURL = /file:\/\/\//.test(pathURL)
  if (rmPrefix) {
    return isFileURL ? fileURLToPath(pathURL) : pathURL
  } else {
    return isFileURL ? pathURL : pathToFileURL(pathURL).toString()
  }
}

export function getDirname(pathURL) {
  return path.dirname(getFilename(pathURL, true))
}

export function getRequire(dir = import.meta.url) {
  const { createRequire } = import('module')
  return createRequire(dir)
}
