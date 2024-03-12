import Logger from "./Logger"
import axios from "axios";
import parse from "node-html-parser";

import acorn from "acorn"
import walk from "acorn-walk"
import { DiscordBranch } from "./Types/DiscordBranch";
import { getURLForBranch } from "./Util/GetURLForBranch";

const logger = new Logger("Util/PullClientScripts")

export type FetchedStrings = Map<string, string>

export async function pullClientScripts(mode?: "initial" | "lazy" | "full", branch?: DiscordBranch, fetchedInitialScripts?: FetchedStrings) {
  if (mode == undefined) {
    mode = "full"
  }

  if (branch == undefined) {
    branch = "stable"
  }

  // very janky way to get the scripts.
  // ohwell :airicry:
  const URL = getURLForBranch(branch)

  logger.log("Getting initial scripts");
  try {
    const initialDOM = await axios(URL + "/app")
    const data = (initialDOM.data as string)
    const dom = parse(data)
    const scriptElements = dom.getElementsByTagName("script")

    const initialScripts: string[] = []
    const scripts = new Map<string, string>() as Map<string, string>
    for (let script of scriptElements) {
      const src = script.getAttribute("src")

      if (!src?.endsWith(".js")) {
        continue;
      }
      initialScripts.push(script.getAttribute("src") as string)

      if (mode == "full" || mode == "initial") {
        // scripts[src.replaceAll("/assets/", "")] = (await axios(URL + src)).data
        scripts.set(src.replaceAll("/assets/", ""), (await axios(URL + src)).data)
      }
    }

    logger.log(`Got ${initialScripts.length} initial scripts`);

    if (mode == "full" || mode == "lazy") {
      logger.log(`Getting every script from the lazy-loaded list. This may take a while!`)
      for (let initialScript of initialScripts) {
        const file = (await axios(URL + initialScript)).data
        const parsed = acorn.parse(file, { ecmaVersion: 10 })

        walk.ancestor(parsed, {

          // TODO: improve the Property walker; currently it uses 12 terabytes of memory :airidizzy:

          // async Property(node, _, ancestors) {
          //   const lastAncestor = ancestors[ancestors.length]

          //   if (lastAncestor != undefined && lastAncestor.type != "ObjectExpression") {
          //     return;
          //   }

          //   const key = node.key
          //   const chunkID = ((key as any).value) as number
          //   const isChunk = Number.isInteger(chunkID) == true
          //   const chunk = (node.value as any).value as string
          //   if (chunk == undefined || typeof chunk != "string") {
          //     return
          //   }
          //   const isJSFile = chunk.endsWith(".js") == true

          //   if (isChunk == true && isJSFile == true) {
          //     const fileURL = URL + "/assets/" + chunk
          //     const fileContent = (await axios(URL + "/assets/" + chunk)).data
          //     scripts.set(chunk, fileContent)
          //   }
          // }

          async Literal(node, _, ancestors) {
            // TODO: this is janky. very janky. make it less janky :cr_hUh:
            const value = node.value
            const ancestor = ancestors[ancestors.length - 3]

            if (typeof value === "string" && ancestor.type == "ObjectExpression") {
              if (value.startsWith("lib/") || value.startsWith("istanbul") || value.startsWith("src")) {
                return;
              }

              if ((value as string).endsWith(".js")) {
                const content = (await axios(URL + "/assets/" + value)).data
                scripts.set(value, content)
              }
            }
          }
        })
      }
    }

    logger.log(`Got ${scripts.size} total scripts`);
    return scripts
  } catch (err) {
    logger.error(`Failure while pulling scripts: ${err}`)
    throw err;
  }
}