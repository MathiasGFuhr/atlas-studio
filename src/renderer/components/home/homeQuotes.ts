/** Frases do painel inicial. Uma por dia, na ordem do calendário. */
export const HOME_QUOTES = [
  'O show começa no silêncio do estúdio.',
  'Cada faixa carrega uma noite inteira.',
  'Produzir é transformar emoção em cena.',
  'O público sente o que você termina bem.',
  'Uma boa mixagem deixa a história respirar.',
  'O refrão fica quando a verdade cabe nele.',
  'Terminar a faixa é um ato de coragem.',
  'O detalhe pequeno é o que o ouvido guarda.',
  'Grave hoje o que você não quer esquecer.',
  'A música pronta começa na decisão de soltar.',
  'Silêncio também faz parte do arranjo.',
  'Cada take honesto vale mais que dez perfeitos.',
  'O estúdio é onde a ideia vira presença.',
  'Quem escuta até o fim merece o último acorde.',
  'Publique o que ainda te emociona.',
  'A faixa cresce quando você tira o excesso.',
  'Ritmo é promessa: cumpra no tempo certo.',
  'A voz entra quando o resto já sabe esperar.',
  'Uma noite bem produzida cabe em três minutos.',
  'O clique certo economiza uma semana.',
  'Deixe o gancho simples o bastante para voltar.',
  'A capa promete. A faixa entrega.',
  'Editar é escolher o que permanece.',
  'O ouvinte não vê o processo. Ele sente o corte.',
  'Comece pelo que você cantaria sem playback.',
  'Uma ideia fraca não se salva no volume.',
  'O baixo segura o chão para a melodia voar.',
  'Grave menos. Diga mais.',
  'A transição é onde a atenção decide ficar.',
  'Seu catálogo é a soma das faixas que você soltou.',
  'O primeiro verso apresenta. O segundo aprofunda.',
  'Consistência também é talento.',
  'Uma referência ajuda. A sua voz decide.',
  'O final da faixa é a última impressão.',
  'Produzir é cuidar do que o outro vai sentir sozinho.',
  'Não espere o dia perfeito. Grave o de hoje.',
  'A harmonia certa faz a letra parecer inevitável.',
  'Espaço na mix é respeito por quem escuta.',
  'Uma rotina curta vence a inspiração que não chega.',
  'Amanhã a faixa de hoje já é repertório.',
]

/** Dia do ano no fuso local, estável durante o dia inteiro. */
export function dayOfYear(now = new Date()): number {
  const year = now.getFullYear()
  const start = Date.UTC(year, 0, 1)
  const today = Date.UTC(year, now.getMonth(), now.getDate())
  return Math.round((today - start) / 86_400_000)
}

export function quoteForDate(now = new Date(), quotes = HOME_QUOTES): string {
  if (quotes.length === 0) return ''
  const index = dayOfYear(now) % quotes.length
  return quotes[index] ?? quotes[0]
}
