import {
  ClientScript,
  ScriptFlags,
  pullClientScripts
} from "../ClientScriptsPuller"
import { parseSync } from "oxc-parser"
import { walk } from "estree-walker"
import { getExperiments } from ".."
import murmurhash from "murmurhash"
import { BuildData, BuildFlags } from "../Types/BuildData"
import Logger from "../Logger"
import { DiscordBranch } from "../Types/DiscordBranch"
import { Experiment, GuildExperiment } from "../Types/Experiments"

const logger = new Logger("Util/CompileBuildData");

export async function compileBuildData(branch: DiscordBranch = DiscordBranch.Stable): Promise<BuildData | Error> {
  logger.log("Fetching initial scripts...")
  const scripts = await pullClientScripts("full", branch)

  if (scripts === undefined) {
    logger.error("Failed to fetch initial scripts");
    throw new Error("Failed to fetch initial scripts")
  }

  let initialScripts = scripts.initial
  let lazyScripts = scripts.lazy

  logger.log("Fetching experiments...")
  const experiments = await getExperiments(branch, scripts.lazy)
  const strings = new Map<string, string>() as Map<string, string>

  let clientInfo = {
    builtAt: undefined as number | undefined,
    buildNumber: undefined as number | undefined,
    buildHash: undefined as string | undefined
  }

  // Attempts to find a language object or a client info object
  // from the specified script.

  // :kanadejil:
  async function findTheOnePiece(script: ClientScript) {
    try {
      const content: string = script.content as string
      const ast = parseSync(content)

      walk(JSON.parse(ast.program), {
        enter(node: any) {
          const properties: any[] = node?.properties

          if (node.type === "ObjectExpression") {
            const buildNumber = properties.find(prop => (prop as any)?.key?.name == "buildNumber")
            const buildHash = properties.find(prop => (prop as any)?.key?.name == "versionHash")
            const builtAt = properties.find(prop => (prop as any)?.key?.name == "built_at")

            const isLanguageObject = properties.find(prop => (prop as any)?.key?.name == "DISCORD") != undefined

            if (buildNumber !== undefined) {
              const hasValue = buildNumber.value?.value != undefined

              // For some reason there's a second buildNumber property, in another object
              // that has a function value..?
              // :fear:

              if (hasValue !== true) {
                return
              }

              clientInfo.buildNumber = parseInt(buildNumber.value?.value) as number
            }
            if (buildHash !== undefined) {
              clientInfo.buildHash = buildHash.value?.value as string
            }
            if (builtAt !== undefined) {
              clientInfo.builtAt = parseInt(builtAt.value?.value) as number
            }

            if (isLanguageObject == true) {
              logger.log(`Found the language object!: ${script.path}`)
              script.flags.push(ScriptFlags.LanguageObject)
              properties.forEach((node) => {
                const prop = node as any
                const key = prop.key as any
                const value = prop.value as any

                const keyName = key.name as string
                strings.set(keyName, '"' + value.value + '"' as string)
              })
            }
          }
        },
      })
    } catch (err) {
      logger.error(`Error while parsing ${script.path}:`)
      console.error(err)
    }
  }

  const languageObjectScript = initialScripts.find(script => script.flags.includes(ScriptFlags.LanguageObject))
  const clientInfoScript = initialScripts.find(script => script.flags.includes(ScriptFlags.ClientInfo))

  if (languageObjectScript === undefined) {
    logger.error("Could not find any script wit the language_object tag! Aborting !! (the one piece could not be found)")
    throw new Error("LanguageObject could not be found");
  }

  if (clientInfoScript === undefined) {
    logger.error("Could not find any script wit the client_info tag! Aborting !! (the one piece could not be found)")
    throw new Error("Script with a client_info object could not be found");
  }

  await findTheOnePiece(clientInfoScript)
  await findTheOnePiece(languageObjectScript)

  if (clientInfo.buildNumber == undefined || clientInfo.buildHash == undefined || clientInfo.builtAt == undefined) {
    logger.error("Compile error: Couldn't find buildNumber/versionHash/builtAt! Aborting (the one piece couldn't be found)")
    return new Error("Couldn't find buildNumber/versionHash/builtAt")
  }

  logger.log(`Build info: 
    Built at: ${new Date(clientInfo.builtAt)}
    Build number: ${clientInfo.buildNumber}
    Build hash: ${clientInfo.buildHash}
  `)

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
    strings_diff: [],
    experiments: mappedExperiments,
    date_found: new Date(Date.now()),
    built_on: new Date(clientInfo.builtAt),
    branches: [branch],
    flags: [BuildFlags.NeedsStringRediff],
    build_number: clientInfo.buildNumber,
    build_hash: clientInfo.buildHash,
    counts: {
      experiments: mappedExperiments.size,
      strings: strings.size,
    },
    scripts: {
      // TODO: add support for the ClientScript type, instead of mapping them to the path
      initial: initialScripts.map((script) => script.path),
      lazy: lazyScripts.map((script) => script.path),
    },
  }

  logger.log(`Build ${buildData.build_number} has been compiled!`)
  return buildData
}