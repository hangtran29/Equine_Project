// Nút đổi ngôn ngữ VI / EN trên thanh trên cùng của ứng dụng.
import { currentLang, setLang } from './runtime.js'

export default function LanguageSwitch() {
  const lang = currentLang()
  return <div className="lang-switch" role="group" aria-label="Ngôn ngữ / Language" data-no-translate>
    {[['vi', 'VI', 'Tiếng Việt'], ['en', 'EN', 'English']].map(([code, short, name]) =>
      <button key={code} type="button" aria-pressed={lang === code} title={name} className={lang === code ? 'is-active' : ''}
        onClick={() => { if (code !== lang) setLang(code) }}>{short}</button>)}
  </div>
}
