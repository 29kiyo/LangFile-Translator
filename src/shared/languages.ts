export interface Language {
  /** 翻訳APIに渡すコード (例: ja, zh-CN) */
  code: string
  /** ja_jp.json 形式の地域部分 (無い言語は空) */
  region: string
}

// code:REGION (REGION 無しは地域なし。zh-CN のように地域付きコードは常に地域付きのファイル名)
const RAW = `
af:ZA ak:GH am:ET ar:SA as:IN ay:BO az:AZ be:BY bg:BG bho:IN bm:ML bn:BD br:FR bs:BA
ca:ES ceb:PH ckb:IQ co:FR cs:CZ cy:GB da:DK de:DE doi:IN dv:MV ee:GH el:GR en:US eo
es:ES et:EE eu:ES fa:IR ff:SN fi:FI fo:FO fr:FR fy:NL ga:IE gd:GB gl:ES gn:PY gu:IN
ha:NG haw:US he:IL hi:IN hmn hr:HR ht:HT hu:HU hy:AM id:ID ig:NG ilo:PH is:IS it:IT
ja:JP jv:ID ka:GE kk:KZ kl:GL km:KH kn:IN ko:KR kri:SL ku:TR ky:KG la lb:LU lg:UG
ln:CD lo:LA lt:LT lus:IN lv:LV mai:IN mg:MG mi:NZ mk:MK ml:IN mn:MN mni:IN mr:IN
ms:MY mt:MT my:MM ne:NP nl:NL no:NO nso:ZA ny:MW oc:FR om:ET or:IN pa:IN pl:PL ps:AF
pt-BR pt-PT qu:PE rm:CH ro:RO ru:RU rw:RW sa:IN sd:PK si:LK sk:SK sl:SI sm:WS sn:ZW
so:SO sq:AL sr:RS st:LS su:ID sv:SE sw:KE ta:IN te:IN tg:TJ th:TH ti:ET tk:TM tl:PH
tr:TR ts:ZA tt:RU ug:CN uk:UA ur:PK uz:UZ vi:VN wa:BE xh:ZA yi yo:NG zh-CN zh-TW zu:ZA
zh-HK en-GB es-MX fr-CA sr-Latn nb:NO nn:NO fil:PH yue:HK
`

export const LANGUAGES: Language[] = RAW.trim()
  .split(/\s+/)
  .map((tok) => {
    const [code, region = ''] = tok.split(':')
    return { code, region }
  })

export function getLanguage(code: string): Language | undefined {
  return LANGUAGES.find((l) => l.code === code)
}

/** ja_jp の形 (地域のない言語は ja)。zh-CN 等は常に zh_cn */
export function fileBaseName(l: Language): string {
  if (l.code.includes('-')) return l.code.replace('-', '_').toLowerCase()
  if (!l.region) return l.code
  return `${l.code}_${l.region.toLowerCase()}`
}

export function fileNameFor(l: Language): string {
  return `${fileBaseName(l)}.json`
}
