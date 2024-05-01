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
}

export type ClientScript = {
  path: string,
  content?: string,
  flags: ScriptFlags[]
}

export type FetchedStrings = Map<string, string>
const IGNORED_FILENAMES = ["NW.js", "Node.js", "bn.js", "hash.js", "utf8str", "t61str", "ia5str", "iso646str"];

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
    // logger.log(`Fetching script: ${file}`)

    const script = await fetchScriptFile(branch, "/assets/" + _script.path)
    if (script != undefined) {
      _script.content = script
      // add flags
      const hasLanguageObject = SCRIPT_REGEXES.hasLanguageObject.test(script)
      const hasClientInfo = SCRIPT_REGEXES.hasClientInfo.test(script)
      const hasTheOtherClientInfo = SCRIPT_REGEXES.hasTheOtherClientInfoIDontEvenKnowAnymore.test(script)

      if (hasLanguageObject === true && _script.flags.find((flag) => flag === ScriptFlags.LanguageObject) === undefined) {
        _script.flags.push(ScriptFlags.LanguageObject)
      }

      if (hasClientInfo === true || hasTheOtherClientInfo === true && _script.flags.find((flag) => flag === ScriptFlags.ClientInfo) === undefined) {
        _script.flags.push(ScriptFlags.ClientInfo)
      }
    }
  }

  // seperating them because of ratelimits
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

  walker.walk(JSON.parse(ast.program), {
    enter: (node: any, parent: any) => {
      if (parent === null) { return; }
      let isChunk = false
      let chunkID: number | undefined = undefined;
      let chunkHash: string | undefined = undefined;

      if (node.type === "ConditionalExpression") {
        const test = node.test
        const consequent = node.consequent

        if (test === undefined) { return; }
        if (consequent === undefined) { return; }
        if (test.type !== "BinaryExpression" || consequent.type !== "BinaryExpression") { return; }
        const testLeft = test.left
        const consequentRight = consequent.right
        if (consequentRight.type !== "StringLiteral") { return; }

        const _chunkID: string = testLeft.value
        const _chunkHash: string = consequentRight.value

        const isChunkHash = _chunkHash.endsWith(".js") === true

        if (isChunkHash === true) {
          chunkID = Number.parseInt(_chunkID)
          chunkHash = `${_chunkID}${_chunkHash}`
          isChunk = true
        } else {
        }
      }

      if (node.type === "ObjectProperty") {
        const key = node?.key
        const value = node?.value

        const _chunkId = key?.value
        const _chunkHash = value?.value

        // why would we parse numbers..
        if (typeof _chunkHash !== "string") {
          return;
        }

        if (_chunkHash !== undefined) {
          if (_chunkHash.endsWith(".js")) {
            chunkID = Number.parseInt(_chunkId)
            chunkHash = `${_chunkHash}`
            isChunk = true
          }
        }
      }

      if (parent.type === "ObjectExpression") {
        const key = node.key
        const value = node.value

        if (key === undefined) { return; }
        if (value === undefined) { return; }

        const _chunkID = key.value
        const isChunkIDNum = Number.isInteger(_chunkID) === true
        const _chunkHash: string = value.value

        if (typeof (_chunkHash) !== "string") {
          return;
        }

        const isHash = IGNORED_FILENAMES.includes(_chunkHash) !== true
          && _chunkHash.startsWith("F") !== true
          && _chunkHash.endsWith(".js") !== true
          && JS_URL_REGEXES.regex_url_hash.test(_chunkHash)

        const isChunkFile = _chunkHash !== undefined
          && isChunkIDNum === true
          && isHash === true

        if (isChunkFile === true) {
          chunkID = Number.parseInt(_chunkID)
          chunkHash = _chunkHash
          isChunk = true
        }
      }


      if (isChunk === true && chunkID !== undefined && chunkHash !== undefined) {
        if (!chunkHash.endsWith(".js")) {
          chunkHash = `${chunkHash}.js`
        }

        lazyScripts.push({
          path: chunkHash,
          flags: [],
        })
      }
    },
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
        logger.error("Catastrophic Failure: Could not find any lazy scripts in the chunkloader!!")
        throw new Error("Catastrophic failure!")
      }

      await fetchScripts(branch, clientScripts.lazy, true)
    }

    const initialLength = clientScripts.initial.length
    const lazyLength = clientScripts.lazy.length

    logger.log(`Got ${initialLength + lazyLength} total scripts, ${initialLength} initial and ${lazyLength} lazy`);

    return clientScripts
  } catch (err) {
    logger.error(`Failure while pulling scripts: ${err}`)
    throw err;
  }
}