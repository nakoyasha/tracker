import { ClientScript, ScriptFlags } from "../../ClientScriptsPuller"

import Logger from "../../Logger"
import { Experiment, ExperimentType } from "../../Types/Experiments";
import { astToJSValue, hasProperty, isExperiment } from "../../Util/AST/ASTToJSValue";
import { ASTPlugin } from "../../Parsers/ASTPlugin";
import assert from "node:assert";
import exp from "node:constants";
import murmurhash from "murmurhash";

const logger = new Logger("Util/PullExperimentData/ASTPuller")

export type ASTExperiment = {
  id: number,
  label: string,
  config: any,
  kind: ExperimentType,
  treatments: {
    id: number;
    label: string;
  }[];
}


// yoinked from https://github.com/Discord-Build-Logger/Scraper/blob/main/src/plugins/experiments/ast.ts
// thank you megu !!!
/*
  ==Problems==

  1. MemberExpressions - stuff like `"id": o.Z.FOO` is too hard to parse. Needs runtime evaluation.

  2. CallExpressions - ones like .concat() or .map(), etc.
  They sometimes reference other variables too, so also needs runtime evaluation.

  3. SpreadElement - [..., 1, 2, 3], often map treatment ids to descriptions..? for some reason? also need runtime evaluation.

  4. StaticMemberExpression - a result of backtracking, experiment still gets parsed like normal

  5. 2020-01_in_app_reporting - Uses the old register function...
*/

export class ASTExperiments implements ASTPlugin {
  name = "experiments";
  requiredFlags = [ScriptFlags.Experiments];
  private experiments: ASTExperiment[] = []

  private readonly expFields = ["kind", "id", "label"];
  private readonly ignoreFields = ["defaultConfig", "config"];

  private validateASTExperiment(exp: ASTExperiment) {
    assert(
      exp.kind === ExperimentType.Guild ||
      exp.kind === ExperimentType.User ||
      exp.kind === ExperimentType.None,
      "Invalid experiment type",
    );
    assert(typeof exp.id === "string", "Invalid experiment id");
    assert(typeof exp.label === "string", "Invalid experiment title");
    assert(
      typeof exp.treatments === "object",
      "Invalid experiment treatments object",
    );
    assert(
      exp.treatments.every(
        (treatment) =>
          typeof treatment.id === "number" &&
          typeof treatment.label === "string",
      ),
      "Invalid experiment treatments data",
    );
  }

  private hasProperty(node: any, name: string) {
    if (node.type !== "ObjectExpression") throw new Error("Not an object");

    return node.properties.some((prop: any) => {
      if (!prop.key) return false;

      if (prop.key.type === "Identifier") {
        return prop.key.name === name;
      }

      if (prop.key.type === "Literal") {
        return prop.key.value === name;
      }

      return false;
    });
  }

  private isEnumExpression(node: any): boolean {
    if (node.type !== "MemberExpression") return false;

    if (node.object.type === "MemberExpression" && !node.computed) {
      return this.isEnumExpression(node.object);
    }

    if (node.object.type === "Identifier" && !node.computed) {
      return node.property.type === "Identifier";
    }

    return false;
  }

  private isExperiment(node: any) {
    return this.expFields.every((prop) => this.hasProperty(node, prop));
  }

  private astToJSValue(node: any): any {
    if (
      node.type === "Literal" ||
      node.type === "StringLiteral" ||
      node.type === "NumericLiteral"
    ) {
      return node.value;
    }

    if (node.type === "ObjectExpression") {
      const obj: Record<string, any> = {};

      for (const prop of node.properties) {
        if (!prop.key) continue;

        let name: string;
        if (prop.key.type === "Identifier") name = prop.key.name;
        else if (
          prop.key.type === "Literal" ||
          prop.key.type === "StringLiteral" ||
          prop.key.type === "NumericLiteral"
        ) {
          name = prop.key.value;
        } else {
          continue;
        }

        if (this.ignoreFields.includes(name)) continue;
        obj[name] = this.astToJSValue(prop.value);
      }

      return obj;
    }

    if (node.type === "ArrayExpression") {
      return node.elements.map((elem: any) => this.astToJSValue(elem));
    }

    if (node.type === "Identifier") {
      //return node.name
    }

    if (node.type === "UnaryExpression" && node.operator === "!") {
      return !this.astToJSValue(node.argument);
    }

    if (node.type === "StaticMemberExpression") {
      return;
    }

    if (this.isEnumExpression(node)) {
      //return node.property.name
    }

    throw new Error(`Unsupported node type ${node.type}`);
    //return this.script.substring(node.start, node.end)
  }

  public run(script: ClientScript, node: any): void {
    if (node.type !== "ObjectExpression") return;

    if (this.isExperiment(node)) {
      try {
        const exp: ASTExperiment = this.astToJSValue(node);
        this.validateASTExperiment(exp);

        this.experiments.push(exp);
      } catch (ex: any) {
        logger.error(
          `Failed to parse script ${script.path} ${script?.content?.substring(node.start, node.end)}: ${ex.message}`,
        );
      }
    }
  }

  public finish(): Experiment[] {
    const experiments = this.experiments.map((exp: ASTExperiment) => {
      return {
        title: exp.label,
        hash_key: exp.id,
        hash: murmurhash(exp.id.toString()),
        name: exp.label,
        description: exp.treatments.map((treatment) => {
          return treatment.label
        }),
        buckets: exp.treatments.map((treatment) => {
          return treatment.id
        }),
        type: exp.kind,
      }
    })

    //@ts-ignore go away pls
    return experiments as Experiment[]
  }

}