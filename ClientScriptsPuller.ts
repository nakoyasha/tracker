import Logger from "./Logger"
import parse from "node-html-parser";

import acorn, { Literal, Property } from "acorn"
import walk from "acorn-walk"
import { DiscordBranch } from "./Types/DiscordBranch";
import { getURLForBranch } from "./Util/GetURLForBranch";

const logger = new Logger("Util/PullClientScripts")

export type FetchedStrings = Map<string, string>

async function fetchScriptFile(baseUrl: string, fileName: string) {
  const url = new URL(fileName, baseUrl)
  try {
    const response = await fetch(url)

    if (!response.ok) {
      logger.error(`Failed to fetch script ${url}! Response code: ${response.status}`)
      return;
    } else {

      return response.text()
    }
  } catch (err) {
    console.log(err)
    logger.error(`Failed to fetch script ${url}! Error: ${err}`)
  }
}

async function fetchFilesAndPutThemInMap(baseUrl: string, files: string[], map: Map<string, string>, makeItFast?: boolean) {
  async function fetchFile(file: string) {
    logger.log(`Fetching script: ${file}`)

    const script = await fetchScriptFile(baseUrl, "/assets/" + file)
    if (script != undefined) {
      map.set(file, script)
    }
  }

  // seperating them because of ratelimits
  if (makeItFast != undefined) {
    await Promise.all(files.map(async (file) => {
      await fetchFile(file)
    }))
  } else {
    for (let file of files) {
      await fetchFile(file)
    }
  }
}

export async function pullClientScripts(mode?: "initial" | "lazy" | "full", branch?: DiscordBranch, fetchedInitialScripts?: FetchedStrings) {
  if (mode == undefined) {
    mode = "full"
  }

  if (branch == undefined) {
    branch = "stable"
  }

  // very janky way to get the scripts.
  // ohwell :airicry:
  const branchURL = getURLForBranch(branch) as string
  const appUrl = new URL("/app", branchURL)
  let initialScripts: string[] = []
  let lazyScripts: string[] = []

  const scripts = new Map<string, string>() as Map<string, string>

  logger.log("Getting initial scripts");
  try {
    const appResponse = await fetch(appUrl)

    if (!appResponse.ok) {
      logger.error("Failed to fetch the initial dom? Response code: " + appResponse.status);
      return;
    }

    const appHtml = await appResponse.text()
    const dom = parse(appHtml)

    const scriptElements = dom.getElementsByTagName("script")

    // fetch initial scripts
    for (let script of scriptElements) {
      const filePath = script.getAttribute("src")

      if (!filePath?.endsWith(".js")) {
        continue;
      }

      const relativePath = filePath.replaceAll("/assets/", "")
      initialScripts.push(relativePath as string)
    }
    logger.log(`Got ${initialScripts.length} initial scripts`);

    if (mode == "full" || mode == "initial") {
      await fetchFilesAndPutThemInMap(branchURL, initialScripts, scripts)
    }

    // fetch lazy scripts
    if (mode == "full" || mode == "lazy") {
      logger.log(`Getting every script from the lazy-loaded list. This may take a while!`)
      const chunkLoader = initialScripts.find((script) => script.startsWith("web"))
      if (chunkLoader == undefined) {
        console.log(`Chunk loader is undefined ??`)
        return;
      }

      const file = await fetchScriptFile(branchURL, "/assets/" + chunkLoader)

      if (file == undefined) {
        logger.error("Failed to fetch the chunk loader!");
        return;
      }
      const ast = acorn.parse(file, { ecmaVersion: 10 })

      walk.ancestor(ast, {
        async Property(node, _, ancestors) {
          const parent = ancestors[ancestors.length]

          if (parent != undefined && parent.type != "ObjectExpression") {
            return;
          }
          const property: Property = node as Property

          const chunkID = (property.key as Literal).value
          const isChunk = Number.isInteger(chunkID) == true
          const chunk = (property.value as Literal).value

          if (chunk == undefined || typeof chunk != "string") {
            return
          }

          const isJSFile = true //chunk.endsWith(".js") == false

          if (isChunk == true && isJSFile == true) {
            let fileURL = chunk
            if (fileURL.endsWith(".js") != true) {
              fileURL = fileURL + ".js"
            }

            lazyScripts.push(fileURL)
          }
        },
      })

      await fetchFilesAndPutThemInMap(branchURL, lazyScripts, scripts)
    }


    logger.log(`Got ${scripts.size} total scripts, ${initialScripts.length} initial and ${lazyScripts.length} lazy`);

    // clear out arrays
    initialScripts = []
    lazyScripts = []
    return scripts
  } catch (err) {
    logger.error(`Failure while pulling scripts: ${err}`)
    throw err;
  }
}