/**
 * Helpers compartilhados pelas duas categorias de Prompts rápidos
 * ("Criar imagem" e "Animar / Lipsync").
 */

/** Chave do favorito de um preset embutido, separada dos ids de prompt personalizado. */
export function presetFavoriteKey(category: string, id: string): string {
  return `${category}:${id}`
}

interface LabeledPreset {
  id: string
  label: string
}

/** Favoritos primeiro, marcados com estrela dentro do próprio seletor. */
export function toOptions(items: LabeledPreset[], favorites: Set<string>, category: string) {
  return items
    .map((item) => ({
      value: item.id,
      label: item.label,
      favorite: favorites.has(presetFavoriteKey(category, item.id)),
    }))
    .sort((a, b) => Number(b.favorite) - Number(a.favorite))
    .map(({ value, label, favorite }) => ({ value, label: favorite ? `★ ${label}` : label }))
}
