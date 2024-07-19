import Logger from "./Logger"
import parse from "node-html-parser";
import {
  JS_URL_REGEXES,
  SCRIPT_REGEXES,
} from "./constants";

import * as walker from "estree-walker";
import { parseSync } from "oxc-parser"

import { DiscordBranch } from "./Types/DiscordBranch";
import { fetch, setGlobalDispatcher, Agent } from 'undici'

// otherwise fetch dies while fetching too many files
setGlobalDispatcher(new Agent({ connect: { timeout: 60_000 } }))

const logger = new Logger("Util/PullClientScripts")
export type ClientScripts = {
  initial: ClientScript[],
  lazy: ClientScript[]
  totalCount: number,
}

export enum ScriptFlags {
  LanguageObject = "language_object",
  ChunkLoader = "chunk_loader",
  ClientInfo = "client_info",
  Experiments = "experiments",
}

export type ClientScript = {
  path: string,
  content?: string,
  flags: ScriptFlags[]
}

export type FetchedStrings = Map<string, string>
const IGNORED_FILENAMES = ["NW.js", "Node.js", "bn.js", "hash.js", "utf8str", "t61str", "ia5str", "iso646str", "src/createAnimatedComponent.js"];

export async function fetchScriptFile(branch: DiscordBranch, fileName: string) {
  const url = new URL(fileName, branch)
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

export async function fetchScripts(branch: DiscordBranch, scripts: ClientScript[], makeItFast?: boolean) {
  async function fetchFile(_script: ClientScript) {
    const script = await fetchScriptFile(branch, "/assets/" + _script.path)
    if (script != undefined) {
      _script.content = script
      // add flags
      const flags = new Set<ScriptFlags>(_script.flags)

      const hasLanguageObject = SCRIPT_REGEXES.hasLanguageObject.test(script)
      const hasClientInfo = SCRIPT_REGEXES.hasClientInfo.test(script)
      const hasTheOtherClientInfo = SCRIPT_REGEXES.hasTheOtherClientInfoIDontEvenKnowAnymore.test(script)
      const hasExperiments = SCRIPT_REGEXES.hasExperiment.test(script)

      if (hasLanguageObject) {
        flags.add(ScriptFlags.LanguageObject)
      }

      if (hasClientInfo || hasTheOtherClientInfo) {
        flags.add(ScriptFlags.ClientInfo)
      }

      if (hasExperiments) {
        flags.add(ScriptFlags.Experiments)
      }

      _script.flags = Array.from(flags)
    }
  }

  // seperating them because of ratelimits or something?
  if (makeItFast != undefined) {
    await Promise.all(scripts.map(async (script) => {
      await fetchFile(script)
    }))
  } else {
    for (let script of scripts) {
      await fetchFile(script)
    }
  }
}

export async function fetchInitialScripts(branch: DiscordBranch, overrideUrl?: string) {
  let initialScripts: ClientScript[] = []
  const url = overrideUrl !== undefined ? `${branch}/${overrideUrl}` : `${branch}/app`
  const appResponse = await fetch(url)

  if (!appResponse.ok) {
    logger.error("Failed to fetch the initial dom? Response code: " + appResponse.status);
    throw new Error(`Failed to fetch the initial dom! ${appResponse.status}`);
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
    initialScripts.push({
      path: relativePath,
      flags: [],
    })
  }

  return initialScripts
}

export async function fetchLazyLoadedScripts(chunkLoader: string) {
  let lazyScripts: ClientScript[] = []
  const ast = parseSync(chunkLoader);

  function pushChunk(chunkId: number, chunkHash: string) {
    if (!chunkHash.endsWith(".js")) {
      chunkHash = `${chunkHash}.js`
    }

    lazyScripts.push({
      path: chunkHash,
      flags: [],
    })
  }

  walker.walk(JSON.parse(ast.program), {
    enter: (node: any, parent: any) => {
      if (parent === null) { return; }

      if (node.type == "BinaryExpression") {
        const left = node?.left
        const right = node?.right

        if (left == undefined || right == undefined) { return; }

        if (left.type == "BinaryExpression" && right.type == "StringLiteral") {
          // other files are useless to us, we only care about scripts (for now, at least)
          if (right.value != ".js") { return; }

          const nestedBinaryExpression = left?.right
          if (nestedBinaryExpression?.type == "ComputedMemberExpression") {
            const innerRight = nestedBinaryExpression?.object

            if (innerRight?.type == "ParenthesizedExpression") {
              const expression = innerRight?.expression
              const properties = expression?.properties

              for (let property of properties) {
                const key = property?.key
                const value = property?.value

                if (key.type != "NumericLiteral") { continue; }
                if (value?.type != "StringLiteral") { continue; }

                const chunkId = key?.value
                const chunkHash = value?.value

                pushChunk(chunkId, chunkHash)
              }
            }
          }
        }
      }
    }
  })

  return lazyScripts
}

export async function getChunkLoader(branch: DiscordBranch, overrideUrl?: string) {
  const initialScripts = await fetchInitialScripts(branch, overrideUrl)
  const chunkLoader = initialScripts.find((script) => script.path.startsWith("web"))?.path

  if (chunkLoader == undefined) {
    console.log(`Failed to find the chunk loader in initial scripts!`)
    throw new Error("ChunkLoader is missing from the initial scripts")
  }

  const file = await fetchScriptFile(branch, "/assets/" + chunkLoader)

  if (file == undefined) {
    logger.error("Failed to fetch the chunk loader!");
    throw new Error("Failed to fetch the chunk loader!");
  }

  return file
}

export async function pullClientScripts(mode: "initial" | "lazy" | "full" = "full", branch: DiscordBranch = DiscordBranch.Stable, versionHash?: string): Promise<ClientScripts | undefined> {
  // very janky way to get the scripts.
  // ohwell :airicry:
  const clientScripts: ClientScripts = {
    initial: [],
    lazy: [],
    totalCount: 0,
  }


  console.time("Scraping scripts")
  try {
    logger.log("Getting initial scripts");
    clientScripts.initial = await fetchInitialScripts(branch, versionHash)
    logger.log(`Got ${clientScripts.initial.length} initial scripts`);

    if (mode === "full" || mode === "initial") {
      await fetchScripts(branch, clientScripts.initial, true)
    }

    if (mode === "full" || mode === "lazy") {
      logger.log("Fetching the chunk loader..")
      const chunkLoader = await getChunkLoader(branch, versionHash)
      logger.log(`Getting every script from the lazy-loaded list. This may take a while!`)

      clientScripts.lazy = await fetchLazyLoadedScripts(chunkLoader)

      if (clientScripts.lazy.length === 0) {
        throw new Error("Catastrophic Failure: Could not find any lazy scripts in the chunkloader!!")
      }

      await fetchScripts(branch, clientScripts.lazy, true)
    }

    const initialLength = clientScripts.initial.length
    const lazyLength = clientScripts.lazy.length

    console.timeEnd("Scraping scripts")
    logger.log(`Got ${initialLength + lazyLength} total scripts, ${initialLength} initial and ${lazyLength} lazy`);

    return clientScripts
  } catch (err) {
    logger.error(`Failure while pulling scripts: ${err}`)
    throw err;
  }
}