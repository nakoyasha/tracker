import { ClientScript } from "../ClientScriptsPuller"
import { ExperimentPuller } from "../ExperimentPuller";

import { parseSync } from "oxc-parser";
import { walk } from "estree-walker"

import { DiscordBranch } from "../Types/DiscordBranch"
import Logger from "../Logger"
import { Experiment } from "../Types/Experiments";
import { astToJSValue, hasProperty, isExperiment } from "../Util/AST/ASTToJSValue";

import { SCRIPT_REGEXES } from "../constants"

const logger = new Logger("Util/PullExperimentData/ASTPuller")

const TREATMENT_FIELDS = ["id", "label", "config"]

function isTreatment(treatmentNode: any) {
  return TREATMENT_FIELDS.every((prop) => hasProperty(treatmentNode, prop));
}

export function parseTreatments(Array: any, script: ClientScript, node: any, experimentHash: string) {
  if (Array.type !== "ArrayExpression") {
    logger.warn(`Encountered an unknown type while parsing treatments: ${Array.type}`)
    return []
  }

  const treatments = Array.elements
  const parsedTreatments = [] as Treatment[]

  treatments.forEach((treatment: any) => {
    // for very rare cases
    if (treatment.type != "ObjectExpression") {
      return;
    }
    try {
      if (isTreatment(treatment) == true) {
        const _treatment: Treatment = astToJSValue(treatment)
        parsedTreatments.push(_treatment)
      }
    } catch (err) {
      logger.error(`Failed to parse experiment ${experimentHash} treatment ${treatment.type} in script ${script.path}: ${err} : \n${script.content?.substring(node.start, node.end)}\n ${treatment}`)
    }
  })

  return parsedTreatments
}

export type Treatment = {
  id: number,
  label: string,
  config: {
    enabled: boolean
  }
}

export class ASTPuller implements ExperimentPuller {
  // experimentspuller demands we have a DiscordBranch type parameter first
  // but we don't need it here..
  // so let's ignore it!
  async getClientExperiments(_: DiscordBranch, scripts: ClientScript[]): Promise<void | Experiment[] | undefined> {
    const experiments = {} as { [key: string]: any }

    for (const script of scripts) {
      try {
        const content: any = script.content as string
        const hasExperiment = SCRIPT_REGEXES.hasExperiment.test(content)

        if (hasExperiment === false) {
          continue
        }

        const ast = parseSync(content)

        walk(JSON.parse(ast.program), {
          enter: (node) => {
            if (node.type !== "ObjectExpression") { return; }

            const properties = node.properties
            const kind = properties.find((prop: any) => prop?.key?.name == "kind")
            const id = properties.find((prop: any) => prop?.key?.name == "id")
            const label = properties.find((prop: any) => prop?.key?.name == "label")
            const treatments = properties.find((prop: any) => prop?.key?.name == "treatments")

            const kindValue = (kind as any)?.value?.value
            const labelValue = (label as any)?.value?.value
            const idValue = (id as any)?.value?.value

            if (isExperiment(node)) {
              const parsedTreatments = parseTreatments((treatments as any)?.value, script, node, idValue)
              experiments[idValue] = {
                type: kindValue,
                hash_key: idValue,
                title: labelValue,
                name: labelValue,
                description: parsedTreatments.map((a) => a.label),
                buckets: parsedTreatments.map((a) => a.id),
              }
            }
          }
        })
      } catch (err) {
        console.log(err)
        logger.error(`ASTPuller encountered an error while getting the AST tree of file ${script.path}: ${err}`)
      }
    }

    return experiments as Experiment[]
  }

}