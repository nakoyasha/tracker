import { ClientScript } from "./ClientScriptsPuller";
import { DiscordBranch } from "./Types/DiscordBranch"
import { Experiment } from "./Types/Experiments";

export interface ExperimentPuller {
  getClientExperiments(branch?: DiscordBranch, scripts?: ClientScript[]): Promise<Experiment[] | void | undefined>;
}