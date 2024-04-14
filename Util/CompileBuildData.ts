import {
  fetchInitialScripts,
  fetchLazyLoadedScripts,
  getChunkLoader,
  fetchFilesAndPutThemInMap
} from "../ClientScriptsPuller"
import acorn,
{
  Identifier,
  Literal,
  Property
} from "acorn"
import { parseSync } from "oxc-parser"
import { walk } from "estree-walker"
import { getExperiments } from ".."
import murmurhash from "murmurhash"
import { BuildData } from "../Types/BuildData"
import Logger from "../Logger"
import { DiscordBranch } from "../Types/DiscordBranch"
import { Experiment, GuildExperiment } from "../Types/Experiments"

const logger = new Logger("Util/CompileBuildData");

export async function compileBuildData(branch: DiscordBranch = DiscordBranch.Stable): Promise<BuildData | Error> {
  logger.log("Fetching initial scripts...")
  const initialScriptsUrls = await fetchInitialScripts(branch);
  const chunkLoader = await getChunkLoader(branch, initialScriptsUrls);

  if (initialScriptsUrls == undefined) {
    logger.error("Failed to fetch initial scripts!")
    return new Error("Failed to fetch initial scripts!")
  }

  logger.log("Fetching lazy-loaded scripts...")
  const lazyScriptsUrls = await fetchLazyLoadedScripts(chunkLoader);

  if (lazyScriptsUrls == undefined) {
    logger.error("Failed to fetch lazy scripts!")
    return new Error("Failed to fetch lazy scripts!")
  }

  let initialScripts = new Map<string, string>()
  let lazyScripts = new Map<string, string>()

  await fetchFilesAndPutThemInMap(branch, initialScriptsUrls, initialScripts, true)
  await fetchFilesAndPutThemInMap(branch, lazyScriptsUrls, lazyScripts, true)


  logger.log("Fetching experiments...")
  const experiments = await getExperiments(branch)
  const strings = new Map<string, string>() as Map<string, string>

  let buildNumber = undefined as number | undefined
  let versionHash = undefined as string | undefined
  let languageObjectFile = undefined as string | undefined

  for (let [path, script] of initialScripts) {
    try {
      const ast = parseSync(script)


      walk(JSON.parse(ast.program), {
        enter(node: any, parent, key, index) {
          if (node.type !== "ObjectExpression") { return }

          const properties: any[] = node.properties
          const fileBuildNumber = properties.find(prop => (prop as any)?.key?.name == "buildNumber")
          const fileVersionHash = properties.find(prop => (prop as any)?.key?.name == "versionHash")

          const isBuildObject = fileBuildNumber != undefined && fileVersionHash != undefined
          const isLanguageObject = properties.find(prop => (prop as any)?.key?.name == "DISCORD") != undefined

          if (isLanguageObject == true) {
            logger.log(`Found the language object!: ${path}`)
            languageObjectFile = path
            properties.forEach((node) => {
              const prop = node as Property
              const key = prop.key as Identifier
              const value = prop.value as Literal

              const keyName = key.name as string
              strings.set(keyName, '"' + value.value + '"' as string)
            })
          } else if (isBuildObject == true) {
            buildNumber = (fileBuildNumber.value as Literal)?.value as number
            versionHash = (fileVersionHash.value as Literal)?.value as string
            logger.log(`Found the buildNumber and versionHash: ${buildNumber}, ${versionHash}`)
          }
        },
      })
    } catch (err) {
      logger.error(`Error while parsing ${path}: ${err}`)

    }
  }

  if (buildNumber == undefined || versionHash == undefined) {
    logger.error("Compile error: Couldn't find buildNumber/versionHash! Aborting")
    return new Error("Couldn't find buildNumber/versionHash")
  }

  logger.log(`Compiling experiments..`)
  const mappedExperiments = new Map<string, Experiment>() as Map<string, Experiment>

  // TODO: put this in getClientExperiments instead of here
  const arrayUserExperiments = Object.values(experiments.user as Experiment[]).filter((experiment) => experiment.hash_key != undefined)
  const arrayGuildExperiments = Object.values(experiments.guild).filter((experiment) => experiment.hash_key != undefined)

  function pushUserExperiment(experiment: Experiment) {
    mappedExperiments.set((experiment.hash_key as string), {
      type: "user",
      hash_key: experiment.hash_key,
      hash: murmurhash(experiment.hash_key as string),
      title: experiment.title,
      name: experiment.name,
      description: experiment.description,
      buckets: experiment.buckets,
    })
  }

  function pushGuildExperiment(experiment: GuildExperiment) {
    mappedExperiments.set((experiment.hash_key as string), {
      type: "guild",
      hash_key: experiment.hash_key,
      hash: murmurhash(experiment.hash_key as string),
      title: experiment.hash_key as string,
      name: experiment.hash_key as string,
      description: [],
      buckets: [],
      revision: 0,
      rollout_position: 0,
      aa_mode: false
    })
  }

  // TODO: change the return type to an object, instead of Experiment[]
  for (let experiment of arrayUserExperiments) {
    pushUserExperiment(experiment)
  }

  for (let experiment of arrayGuildExperiments) {
    pushGuildExperiment(experiment)
  }

  const buildData: BuildData = {
    // Strings: JSON.stringify(Object.fromEntries(strings.entries())),
    strings_diff: [],
    experiments: mappedExperiments,
    date_found: new Date(Date.now()),
    branches: [branch],
    flags: [],
    build_number: buildNumber,
    build_hash: versionHash as string,
    scripts: {
      initial: initialScriptsUrls,
      lazy: lazyScriptsUrls,
    },
  }

  logger.log(`Build ${buildData.build_number} has been compiled!`)
  return buildData
}