import { ClientScript, ScriptFlags } from "../ClientScriptsPuller";
import Logger from "../Logger";
import { ASTPlugin } from "./ASTPlugin";

export type ASTString = Map<string, string>

export class ASTStringsPlugin implements ASTPlugin {
  name = "strings";
  strings: ASTString;
  logger: Logger;
  constructor() {
    this.strings = new Map<string, string>()
    this.logger = new Logger("ASTPlugin/Strings")
  };
  finish() {
    return this.strings;
  }
  requiredFlags = [ScriptFlags.LanguageObject];
  async run(script: ClientScript, node: any) {
    if (node.type !== "ObjectExpression") { return; }
    const properties: any[] = node.properties
    const isLanguageObject = properties.find(prop => (prop as any)?.key?.name == "DISCORD") != undefined

    if (isLanguageObject === true) {
      this.logger.log(`Found the language object!: ${script.path}`)
      script.flags.push(ScriptFlags.LanguageObject)
      Promise.all(properties.map(async (_node: any) => {
        const prop = _node as any
        const key = prop.key as any
        const value = prop.value as any

        const keyName = key.name as string
        this.strings.set(keyName, value.value as string)
      }))
    }
  }
}