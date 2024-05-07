import { ScriptFlags, ClientScript } from "../ClientScriptsPuller";
import Logger from "../Logger";
import { ASTPlugin } from "./ASTPlugin";

export type ClientInfo = {
  build_number: number | undefined,
  build_hash: string | undefined,
  built_at: number | undefined
}

export class ASTClientInfoPlugin implements ASTPlugin {
  name = "client-info";
  client_info = {
    build_number: undefined,
    build_hash: undefined,
    built_at: undefined
  } as ClientInfo;
  logger: Logger;
  constructor() {
    this.logger = new Logger("ASTPlugin/ClientInfo")
  };
  finish() {
    return this.client_info
  }
  requiredFlags = [ScriptFlags.ClientInfo];
  async run(script: ClientScript, node: any) {
    const properties: any[] = node.properties

    if (node.type === "ObjectExpression") {
      const buildNumber = properties.find(prop => (prop as any)?.key?.name == "buildNumber")
      const buildHash = properties.find(prop => (prop as any)?.key?.name == "versionHash")
      const builtAt = properties.find(prop => (prop as any)?.key?.name == "built_at")

      if (buildNumber !== undefined) {
        const hasValue = buildNumber.value?.value != undefined

        // For some reason there's a second buildNumber property, in another object
        // that has a function value..?
        // :fear:

        if (hasValue !== true) {
          return
        }

        this.client_info.build_number = parseInt(buildNumber.value?.value) as number
      }
      if (buildHash !== undefined) {
        this.client_info.build_hash = buildHash.value?.value as string
      }
      if (builtAt !== undefined) {
        this.client_info.built_at = parseInt(builtAt.value?.value) as number
      }
    }
  }
}