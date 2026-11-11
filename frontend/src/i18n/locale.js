// Locale selection is shared by browser components and pure date utilities.
export function currentLang() {
  try { return localStorage.getItem('equi.lang') === 'en' ? 'en' : 'vi' } catch { return 'vi' }
}

export function dateLocale() {
  return currentLang() === 'en' ? 'en-US' : 'en-GB'
}
