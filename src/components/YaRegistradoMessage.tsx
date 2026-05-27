import { Check } from "lucide-react";

/** Teléfono ya registrado en la encuesta (409 / gestionCodigo = 0). */
function YaRegistradoMessage() {
  return (
    <div
      id="seccion-resultado-encuesta"
      className="pr-success pr-success--ya-registrado"
      role="status"
      aria-live="polite"
    >
      <div className="pr-check" aria-hidden="true">
        <Check size={28} strokeWidth={3} />
      </div>
      <p className="pr-success-text">
        <strong>¡Ya estás registrado!</strong>
        Este número ya se encuentra participando en el sorteo de las motos.
      </p>
    </div>
  );
}

export default YaRegistradoMessage;
