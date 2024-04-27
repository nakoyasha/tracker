// :fear:
const JS_URL_REGEX__HASH = /^(?=.*?\d)(?=.*?[a-zA-Z])[a-zA-Z\d]+$/;
const HAS_EXPERIMENT = /createExperiment/g;
const HAS_CLIENT_INFO = /client_info:/g
const HAS_THE_OTHER_CLIENT_INFO_I_DONT_EVEN_KNOW_ANYMORE = new RegExp("buildNumber:", "g")
const HAS_LANGUAGE_OBJECT = /DISCORD:/g

export const JS_URL_REGEXES = {
	regex_url_hash: JS_URL_REGEX__HASH,
};

export const SCRIPT_REGEXES = {
	hasExperiment: HAS_EXPERIMENT,
	hasClientInfo: HAS_CLIENT_INFO,
	hasTheOtherClientInfoIDontEvenKnowAnymore: HAS_THE_OTHER_CLIENT_INFO_I_DONT_EVEN_KNOW_ANYMORE,
	hasLanguageObject: HAS_LANGUAGE_OBJECT
}