import { ClientScript, ScriptFlags } from "../ClientScriptsPuller";
import { ASTPlugin } from "./ASTPlugin"

import { parseSync } from "oxc-parser"
import { walk } from "estree-walker"
import Logger from "../Logger";

// An AST parser, that takes in a list of ASTPlugins, and returns results.
const logger = new Logger("ASTParser")
export class ASTParser {
  plugins: ASTPlugin[];
  results: Map<string, any>;
  constructor(plugins: ASTPlugin[]) {
    this.plugins = plugins
    this.results = new Map()
  }
  getResult<PluginResult>(plugin: string): PluginResult {
    return this.results.get(plugin) as PluginResult
  }
  async parse(scripts: ClientScript[]) {
    for (let script of scripts) {
      for (let plugin of this.plugins) {
        const hasFlagRequirements = plugin.requiredFlags !== undefined
        const hasRegexRequirements = plugin.requiredRegex !== undefined

        let meetsAllRequirements = true;

        if (hasFlagRequirements === true) {
          const requiredFlags = plugin.requiredFlags as ScriptFlags[]
          const meetsFlagRequirement = requiredFlags.every(flag => script.flags.includes(flag))
          meetsAllRequirements = meetsAllRequirements && meetsFlagRequirement
        }

        if (hasRegexRequirements === true) {
          const requiredRegex = plugin.requiredRegex as RegExp[]
          const content = script.content as string
          const meetsRegexRequirement = requiredRegex.every(regex => regex.test(content))
          meetsAllRequirements = meetsAllRequirements && meetsRegexRequirement
        }

        if (meetsAllRequirements === true) {
          const ast = parseSync((script as any).content)

          walk(JSON.parse(ast.program), {
            enter: (node) => {
              try {
                plugin.run(script, node)
              } catch (err) {
                logger.error(`Plugin ${plugin.name} has failed to parse ${script.path}: ${err}`)
              }
            }
          })
          const result = plugin.finish()

          this.results.set(plugin.name, result)
        }
      }
    }

    return this.results
  }
}