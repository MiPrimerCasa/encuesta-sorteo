import { Fragment, useState, type ReactElement } from 'react'
import SorteosHistorial from './SorteosHistorial'
import BasesModal from './BasesModal'
import { SUCURSALES } from '../data/branches'
import { REDES_SOCIALES } from '../data/socialLinks'
import { TEXTOS } from '../data/branding'

interface Props {
  desbloqueado: boolean
}

function BranchFooter({ desbloqueado }: Props) {
  const [basesAbiertas, setBasesAbiertas] = useState(false);
  const iconoPin = (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2a8 8 0 0 0-8 8c0 5.5 7.1 11.4 7.4 11.7a1 1 0 0 0 1.2 0C12.9 21.4 20 15.5 20 10a8 8 0 0 0-8-8Zm0 11a3 3 0 1 1 0-6 3 3 0 0 1 0 6Z" />
    </svg>
  )


  const iconoInstagram = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.8" fill="currentColor" />
    </svg>
  )

  const iconoFacebook = (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.2 0-1.6.8-1.6 1.6V12h2.7l-.4 2.9h-2.3v7A10 10 0 0 0 22 12Z" />
    </svg>
  )

  const iconosPorRed: Record<string, ReactElement> = {
    Instagram: iconoInstagram,
    Facebook: iconoFacebook
  }

  const obtenerMapsUrl = (sucursal: { direccion: string; mapsUrl?: string }) => {
    if (sucursal.mapsUrl && sucursal.mapsUrl.trim() !== '') return sucursal.mapsUrl
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(sucursal.direccion)}`
  }

  return (
    <footer className="footer">
      <SorteosHistorial />

      {/* ---- Redes (debajo del historial de sorteos cuando aplica) ---- */}
      <section className="footer__seccion">
        <h2 className="footer__titulo footer__titulo--redes">
          SEGUINOS EN NUESTRAS REDES
        </h2>
        <div className="redes">
          {REDES_SOCIALES.map((red, idx) => (
            <Fragment key={red.id}>
              <a
                className="red"
                href={red.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Abrir ${red.red}: ${red.handle}`}
              >
                <span className="red__icono" aria-hidden="true">
                  {iconosPorRed[red.red]}
                </span>
                <span className="red__handle">{red.handle}</span>
              </a>
              {idx < REDES_SOCIALES.length - 1 && (
                <span className="redes__separador" aria-hidden="true" />
              )}
            </Fragment>
          ))}
        </div>
      </section>

      {/* ---- Sucursales ---- */}
      <section id="seccion-sucursales" className="footer__seccion">
        <h2 className="footer__titulo">
          {desbloqueado ? 'NUESTRAS SUCURSALES' : 'ENVIÁ LA ENCUESTA PARA DESBLOQUEAR'}
        </h2>
        <div className="sucursales">
          {SUCURSALES.map((suc) =>
            desbloqueado ? (
              <a
                key={suc.id}
                className="sucursal"
                href={obtenerMapsUrl(suc)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Ver ${suc.tipo} en Google Maps: ${suc.direccion}`}
              >
                <span className="sucursal__icono" aria-hidden="true">{iconoPin}</span>
                <span className="sucursal__tipo">{suc.tipo}</span>
                <span className="sucursal__direccion">{suc.direccion}</span>
              </a>
            ) : (
              <button
                key={suc.id}
                disabled
                className="sucursal sucursal--bloqueada"
                aria-label={`Sucursal bloqueada: ${suc.tipo} ${suc.direccion}`}
              >
                <span className="sucursal__icono" aria-hidden="true">{iconoPin}</span>
                <span className="sucursal__tipo">{suc.tipo}</span>
                <span className="sucursal__direccion">{suc.direccion}</span>
              </button>
            )
          )}
        </div>
      </section>

      {/* ---- Aclaración legal ---- */}
      <p className="footer__aclaracion">{TEXTOS.fechaSorteo}</p>

      <div className="footer__bases">
        <button
          type="button"
          className="footer__bases-titulo--btn"
          onClick={() => setBasesAbiertas(true)}
        >
          {TEXTOS.basesCondicionesTitulo} ↗
        </button>
        <ul className="footer__bases-lista">
          {TEXTOS.basesCondicionesLineas.map((linea, idx) => (
            <li key={idx} className="footer__bases-item">
              {linea}
            </li>
          ))}
        </ul>
      </div>

      {basesAbiertas && <BasesModal onClose={() => setBasesAbiertas(false)} />}
    </footer>
  )
}

export default BranchFooter
