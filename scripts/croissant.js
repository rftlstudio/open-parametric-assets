import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

export async function croissant(manifest, version) {
  const hash = createHash('sha256');
  for await (const bytes of createReadStream(manifest)) hash.update(bytes);
  const url = 'https://github.com/rftlstudio/open-parametric-assets';
  const fields = ['id','asset_id','seed','prompt','glb_path','split'];
  return {
    '@context': {'@language':'en','@vocab':'https://schema.org/',sc:'https://schema.org/',
      cr:'http://mlcommons.org/croissant/',rai:'http://mlcommons.org/croissant/RAI/',
      dct:'http://purl.org/dc/terms/',dataType:{'@id':'cr:dataType','@type':'@vocab'}},
    '@type':'Dataset', name:'Open Parametric Assets', version, url,
    description:'Seeded parametric furniture and appliance models with observable states and physical tasks.',
    creator:{'@type':'Organization',name:'Open Parametric Assets contributors',url},
    license:'https://creativecommons.org/licenses/by/4.0/', 'dct:conformsTo':'http://mlcommons.org/croissant/1.0',
    'cr:citeAs':'Open Parametric Assets contributors. Open Parametric Assets v'+version+'. '+url,
    'rai:dataCollection':'Fully synthetic, procedurally generated from original code and seeded parameters. No personal data.',
    'rai:personalSensitiveInformation':'No personal or sensitive information is collected.',
    'rai:dataUseCases':['Robot task simulation','Visual grounding of appliance controls'],
    'rai:dataLimitations':'Simplified collision shapes and physics, linear door springs and no real-world validation.',
    distribution:[{'@type':'cr:FileObject','@id':'manifest', name:'data.jsonl', contentUrl:'data.jsonl',
      encodingFormat:'application/jsonlines',sha256:hash.digest('hex')}],
    'cr:recordSet':[{'@type':'cr:RecordSet','@id':'assets',name:'assets','cr:key':{'@id':'assets/id'},
      'cr:field':fields.map(name => ({'@type':'cr:Field','@id':'assets/'+name,name,
        dataType:name === 'seed' ? 'sc:Integer' : 'sc:Text',
        'cr:source':{'cr:fileObject':{'@id':'manifest'},'cr:extract':{'cr:jsonPath':'$.'+name}}}))}]
  };
}

