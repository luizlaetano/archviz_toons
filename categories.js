// Taxonomia de categorias, compartilhada entre o quadro de referências
// (app.js) e o catálogo geral de materiais (admin.js). Mesma taxonomia
// usada no override de Material ID no 3ds Max.
//
// "pass" indica qual render element identifica essa categoria na máscara:
// a maioria usa o Material ID padrão; Vidro e Água usam o pass separado
// de refração (refractionID), por serem superfícies transparentes/refrativas.
export const CATEGORIES = [
  { id: "piso", label: "Piso", pass: "materialID" },
  { id: "parede", label: "Parede", pass: "materialID" },
  { id: "teto", label: "Teto", pass: "materialID" },
  { id: "esquadria", label: "Esquadria", pass: "materialID" },
  { id: "vidro", label: "Vidro", pass: "refractionID" },
  { id: "agua", label: "Água", pass: "refractionID" },
  { id: "marcenaria", label: "Marcenaria", pass: "materialID" },
  { id: "pedra", label: "Pedra", pass: "materialID" },
  { id: "metais", label: "Metais", pass: "materialID" },
  { id: "estofado", label: "Estofado", pass: "materialID" },
  { id: "madeira_mobiliario", label: "Madeira — mobiliário", pass: "materialID" },
  { id: "metal_mobiliario", label: "Metal — mobiliário", pass: "materialID" },
  { id: "cortina", label: "Cortina", pass: "materialID" },
  { id: "tapete", label: "Tapete", pass: "materialID" },
  { id: "decoracao", label: "Decoração", pass: "materialID" },
  { id: "paisagismo", label: "Paisagismo", pass: "materialID" },
];
