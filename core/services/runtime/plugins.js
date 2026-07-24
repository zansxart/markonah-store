import path from 'path'
import chalk from 'chalk'
import fs from 'fs'
import { existsSync, readFileSync, promises } from 'fs'
import { format } from 'util'
import syntaxerror from 'syntax-error'
import { importModule } from './importModule.js'
import { getFilename, getDirname, getRequire } from './utils.js'

export const pluginFolder = path.join(getDirname(import.meta.url), '../../../plugins')
export const pluginFilter = (filename) => /\.(js|cjs)$/.test(filename)

function compileCommandMetadata(command) {
  const stringCommands = new Set()
  const regexCommands = []

  const add = (value) => {
    if (value instanceof RegExp) {
      regexCommands.push(value)
      return
    }

    if (typeof value === 'string' && value.trim()) {
      stringCommands.add(value.trim().toLowerCase())
    }
  }

  if (Array.isArray(command)) {
    for (const value of command) add(value)
  } else {
    add(command)
  }

  return { stringCommands, regexCommands }
}

export function rebuildPluginRuntime() {
  const orderedEntries = []
  const customPrefixEntries = []
  let order = 0

  for (const [name, plugin] of Object.entries(global.plugins || {})) {
    const commandMetadata = compileCommandMetadata(plugin?.command)
    const entry = {
      name,
      plugin,
      order: order++,
      normalizedPluginName: String(name).replace(/\\/g, '/'),
      hasAll: typeof plugin?.all === 'function',
      hasBefore: typeof plugin?.before === 'function',
      isRunnable: typeof plugin === 'function' || typeof plugin?.run === 'function',
      groupOnly: Boolean(plugin?.group),
      privateOnly: Boolean(plugin?.private),
      customPrefix: plugin?.customPrefix || null,
      stringCommands: commandMetadata.stringCommands,
      regexCommands: commandMetadata.regexCommands,
    }

    orderedEntries.push(entry)
    if (entry.customPrefix) customPrefixEntries.push(entry)
  }

  global.pluginRuntime = {
    orderedEntries,
    customPrefixEntries,
  }

  return global.pluginRuntime
}

export async function loadPlugins(folder) {
  try {
    const files = await fs.promises.readdir(folder, { withFileTypes: true })
    for (const file of files) {
      const filePath = path.join(folder, file.name)
      if (file.isDirectory()) {
        await loadPlugins(filePath)
      } else if (file.isFile() && pluginFilter(file.name)) {
        try {
          const module = await importModule(`${filePath}?update=${Date.now()}`)
          const relativePath = path.relative(pluginFolder, filePath)
          global.plugins[relativePath] = module.default || module
        } catch (error) {
          console.error(chalk.bgRed(chalk.white(`Failed to load plugin ${filePath}:`, error)))
          const relativePath = path.relative(pluginFolder, filePath)
          delete global.plugins[relativePath]
        }
      }
    }
  } catch (error) {
    console.error(chalk.bgRed(chalk.white("Error reading plugins folder:", error)))
  } finally {
    global.plugins = Object.fromEntries(Object.entries(global.plugins).sort(([a], [b]) => a.localeCompare(b)))
    rebuildPluginRuntime()
  }
}

export async function reloadPlugin(_ev, filename, fullPath) {
  const dir = fullPath || path.join(pluginFolder, filename)
  if (!pluginFilter(filename)) return

  if (!existsSync(dir)) {
    global.conn.logger.warn(`Deleted Plugin - '${filename}'`)
    delete global.plugins[filename]
    return
  }

  const fileContent = readFileSync(dir, 'utf8')
  const err = syntaxerror(fileContent, filename, {
    sourceType: 'module',
    allowAwaitOutsideFunction: true,
  })

  if (err) {
    global.conn.logger.error(`Syntax error while loading '${filename}'\n${format(err)}`)
    return
  }

  try {
    if (/\.cjs$/i.test(filename)) {
      const { createRequire } = await import('module')
      const require = createRequire(import.meta.url)
      const resolved = require.resolve(dir)
      if (require.cache[resolved]) {
        delete require.cache[resolved]
      }
      const module = require(dir)
      global.plugins[filename] = module
    } else {
      const modulePath = `${dir}?update=${Date.now()}`
      const module = await importModule(modulePath)
      global.plugins[filename] = module.default || module
    }
    global.conn.logger.info(`Plugin '${filename}' reloaded successfully.`)
  } catch (e) {
    global.conn.logger.error(`Error loading plugin '${filename}'\n${format(e)}`)
  } finally {
    global.plugins = Object.fromEntries(
      Object.entries(global.plugins).sort(([a], [b]) => a.localeCompare(b))
    )
    rebuildPluginRuntime()
  }
}
