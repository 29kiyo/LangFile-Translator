/** 翻訳エンジン (main) が返す英語のエラーのうち、よく出るものを表示言語に直す。それ以外は、そのまま返す */
export function errText(msg: string, t: (key: string) => string): string {
  if (msg.startsWith('No enabled provider')) return t('err.noProvider')
  if (msg.startsWith('Another translation')) return t('err.busy')
  if (msg.startsWith('JSON parse error')) return `${t('err.jsonParse')} (${msg.replace(/^JSON parse error:\s*/, '')})`
  return msg
}
