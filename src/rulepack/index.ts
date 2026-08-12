import { parseRulePack } from '../domain/rules/loader'
import anchorageYaml from './jp-mlit/anchorage.yaml'
import bendYaml from './jp-mlit/bend.yaml'
import coverYaml from './jp-mlit/cover.yaml'
import lapYaml from './jp-mlit/lap.yaml'
import markupYaml from './jp-mlit/markup.yaml'
import measureYaml from './jp-mlit/measure.yaml'
import sourcesYaml from './jp-mlit/sources.yaml'
import unitMassYaml from './jp-mlit/unit-mass.yaml'

const files: Record<string, string> = {
  'sources.yaml': sourcesYaml,
  'cover.yaml': coverYaml,
  'anchorage.yaml': anchorageYaml,
  'lap.yaml': lapYaml,
  'bend.yaml': bendYaml,
  'markup.yaml': markupYaml,
  'measure.yaml': measureYaml,
  'unit-mass.yaml': unitMassYaml,
}

export const jpMlitRulePack = parseRulePack(files)
