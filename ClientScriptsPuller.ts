import Logger from "./Logger"
import parse from "node-html-parser";
import {
  JS_URL_REGEXES,
} from "./constants";

import * as walker from "estree-walker";
import { parseSync } from "oxc-parser"

import { DiscordBranch } from "./Types/DiscordBranch";
import { getURLForBranch } from "./Util/GetURLForBranch";

import { fetch, setGlobalDispatcher, Agent } from 'undici'

// otherwise fetch dies while fetching too many files
setGlobalDispatcher(new Agent({ connect: { timeout: 60_000 } }))

const logger = new Logger("Util/PullClientScripts")

export type FetchedStrings = Map<string, string>
const IGNORED_FILENAMES = ["NW.js", "Node.js", "bn.js", "hash.js", "utf8str", "t61str", "ia5str", "iso646str"];

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

      const ast = parseSync(file);

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
              console.log(_chunkID, _chunkHash)
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
            console.log(`ChunkID: ${chunkID}, Hash: ${chunkHash}`)
            if (!chunkHash.endsWith(".js")) {
              chunkHash = `${chunkHash}.js`
            }
            lazyScripts.push(chunkHash)
          }
        },
      })

      await fetchFilesAndPutThemInMap(branchURL, lazyScripts, scripts, true)
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