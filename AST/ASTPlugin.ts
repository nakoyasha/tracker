import { ClientScript, ScriptFlags } from "../ClientScriptsPuller";

// An interface that runs an AST parse on a script, and returns a result such as strings, experiments, etc.
export interface ASTPlugin {
  name: string
  requiredFlags?: ScriptFlags[],
  requiredRegex?: RegExp[],
  run(script: ClientScript, node: any): void
  finish(): any
}