import { pullClientScripts } from "../ClientScriptsPuller"
import acorn, { Identifier, Literal, Property } from "acorn"
import walk from "acorn-walk"
import { getExperiments } from ".."
import murmurhash from "murmurhash"
import { BuildData } from "../Types/BuildData"
import Logger from "../Logger"
import { DiscordBranch } from "../Types/DiscordBranch"
import { Experiment, GuildExperiment, MinExperiment } from "../Types/Experiments"
import mapIteratorToArray from "./MapIteratorToArray"


const logger = new Logger("Util/CompileBuildData");

export async function compileBuildData(branch: DiscordBranch): Promise<BuildData | Error> {
  logger.log("Fetching initial scripts...")
  const initialScripts = await pullClientScripts("initial", branch)
  console.log(initialScripts.size)
  logger.log("Fetching lazy-loaded scripts...")
  const lazyScripts = await pullClientScripts("lazy", branch, initialScripts)
  logger.log("Fetching experiments...")
  const experiments = await getExperiments(branch)
  const strings = new Map<string, string>() as Map<string, string>

  let buildNumber = undefined as string | undefined
  let versionHash = undefined as string | undefined
  let languageObjectFile = undefined as string | undefined

  for (let [path, script] of initialScripts) {
    const ast = acorn.parse(script, { ecmaVersion: 10 })

    walk.simple(ast, {
      ObjectExpression(node) {
        const properties = node.properties
        const fileBuildNumber = properties.find(prop => (prop as any)?.key?.name == "buildNumber") as Property
        const fileVersionHash = properties.find(prop => (prop as any)?.key?.name == "versionHash") as Property

        const isBuildObject = fileBuildNumber != undefined && fileVersionHash != undefined
        const isLanguageObject = properties.find(prop => (prop as any)?.key?.name == "DISCORD") != undefined

        if (isLanguageObject == true) {
          logger.log("Found the en-us language array!")
          console.log(path)
          languageObjectFile = path
          properties.forEach((node) => {
            const prop = node as Property
            const key = prop.key as Identifier
            const value = prop.value as Literal

            const keyName = key.name as string
            strings.set(keyName, '"' + value.value + '"' as string)
          })
        } else if (isBuildObject == true) {
          buildNumber = (fileBuildNumber.value as Literal)?.value as string
          versionHash = (fileVersionHash.value as Literal)?.value as string
          logger.log(`Found the buildNumber and versionHash: ${buildNumber}, ${versionHash}`)
        }
      }
    })
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

  const testStrings = new Map<string, string>()
  testStrings.set("DISCORD", "DoohickeyCorp")

  const buildData: BuildData = {
    Strings: JSON.stringify(Object.fromEntries(strings.entries())),
    Experiments: mappedExperiments,
    // make it human-comprehensible
    Date: Math.floor(Date.now() / 1000),
    Branch: branch,
    BuildNumber: buildNumber as string,
    VersionHash: versionHash as string,
    Scripts: {
      Initial: await mapIteratorToArray(initialScripts),
      Lazy: await mapIteratorToArray(lazyScripts),
    },
  }

  logger.log(`Build ${buildData.BuildNumber} has been compiled!`)
  return buildData
}