import {
  ShieldCheck,
  Layers,
  Ban,
  Filter,
  Home,
  Users,
  Variable as VariableIcon,
  MapPin,
  CalendarRange,
  Tag,
  type LucideIcon,
} from "lucide-react"
import { GridTab, type GridColumn } from "./GridTab"
import { ExclusionListTab } from "./ExclusionListTab"
import type {
  ElegCountry,
  ValidationConditionsRow,
  CombinedConditionsRow,
  IdPainelRow,
  VariablesRow,
  ParametrosRegionRow,
  CriteriosDatasRow,
  CriteriosExCategRow,
} from "../types"
import {
  validateValidationConditions,
  validateCombinedConditions,
  validateIdPainel,
  validateVariables,
  validateParametrosRegion,
  validateCriteriosDatas,
  validateCriteriosExCateg,
} from "../validation"

/** JAA-613 — registry of the 10 remaining eligibility-params tables. The page
 *  renders one Tab per entry; each `render` builds the specialised editor for
 *  the currently-selected country. */
export interface ExtraTab {
  value: string
  label: string
  icon: LucideIcon
  render: (country: ElegCountry) => React.ReactNode
}

const VALCOND_COLS: GridColumn<ValidationConditionsRow>[] = [
  { key: "Var", label: "Var", type: "string" },
  { key: "Activa", label: "Activa", type: "bool", width: "5rem" },
  { key: "NotNull", label: "NotNull", type: "bool", width: "5rem" },
  { key: "Min", label: "Min", type: "float", width: "7rem" },
  { key: "Max", label: "Max", type: "float", width: "7rem" },
  { key: "Solo No Pesado", label: "Solo No Pesado", type: "bool", width: "8rem" },
]

const COMBINED_COLS: GridColumn<CombinedConditionsRow>[] = [
  { key: "Var1", label: "Var1", type: "string" },
  { key: "Min Var1", label: "Min V1", type: "float", width: "6rem" },
  { key: "Max Var1", label: "Max V1", type: "float", width: "6rem" },
  { key: "NotNull Var1", label: "NN V1", type: "float", width: "5rem" },
  { key: "Var2", label: "Var2", type: "string" },
  { key: "Min Var2", label: "Min V2", type: "float", width: "6rem" },
  { key: "Max Var2", label: "Max V2", type: "float", width: "6rem" },
  { key: "NotNull Var2", label: "NN V2", type: "float", width: "5rem" },
  { key: "Var3", label: "Var3", type: "string" },
  { key: "Min Var3", label: "Min V3", type: "float", width: "6rem" },
  { key: "Max Var3", label: "Max V3", type: "float", width: "6rem" },
  { key: "NotNull Var3", label: "NN V3", type: "float", width: "5rem" },
  { key: "Activa", label: "Activa", type: "bool", width: "5rem" },
  { key: "Solo No Pesado", label: "Solo No Pesado", type: "bool", width: "8rem" },
  { key: "Accion", label: "Accion", type: "string" },
]

const IDPAINEL_COLS: GridColumn<IdPainelRow>[] = [
  { key: "IdPainel_J", label: "IdPainel_J", type: "int" },
  { key: "IdPainel_PD", label: "IdPainel_PD", type: "int" },
]

const VARIABLES_COLS: GridColumn<VariablesRow>[] = [
  { key: "Variable", label: "Variable", type: "string" },
  { key: "Valor", label: "Valor", type: "string" },
]

const REGION_COLS: GridColumn<ParametrosRegionRow>[] = [
  { key: "R", label: "R", type: "int", width: "6rem" },
  { key: "f_fill_flex", label: "f_fill_flex", type: "float" },
  { key: "f_fill_strict", label: "f_fill_strict", type: "float" },
  { key: "f_ok", label: "f_ok", type: "float" },
  { key: "f_ok_flex", label: "f_ok_flex", type: "float" },
]

const DATAS_COLS: GridColumn<CriteriosDatasRow>[] = [
  { key: "Data_Entrada", label: "Data_Entrada", type: "string" },
  { key: "Data_Saida", label: "Data_Saida", type: "string" },
]

const EXCATEG_COLS: GridColumn<CriteriosExCategRow>[] = [
  { key: "ExCateg", label: "ExCateg", type: "string" },
  { key: "IdProduto", label: "IdProduto", type: "int" },
]

export const EXTRA_TABS: ExtraTab[] = [
  {
    value: "validation-conditions",
    label: "Validation_Conditions",
    icon: ShieldCheck,
    render: (country) => (
      <GridTab<ValidationConditionsRow>
        table="Validation_Conditions"
        country={country}
        intro={<>Reglas de validación por variable: rangos <span className="font-mono">Min/Max</span> y flags 0/1. Min no puede superar a Max.</>}
        columns={VALCOND_COLS}
        validate={validateValidationConditions}
        newRow={() => ({ Var: "", Activa: 1, NotNull: 0, Min: 0, Max: 0, "Solo No Pesado": 0 })}
        testidPrefix="valcond"
        addLabel="Agregar condición"
      />
    ),
  },
  {
    value: "validation-combined",
    label: "Validation_Combined_Conditions",
    icon: Layers,
    render: (country) => (
      <GridTab<CombinedConditionsRow>
        table="Validation_Combined_Conditions"
        country={country}
        intro={<>Reglas cruzadas entre hasta 3 variables. <span className="font-mono">Var1</span> es obligatoria; los umbrales de cada variable usada deben ser numéricos.</>}
        columns={COMBINED_COLS}
        validate={validateCombinedConditions}
        newRow={() => ({
          Var1: "",
          Var2: "",
          Var3: "",
          "Min Var1": 0,
          "Max Var1": 0,
          "NotNull Var1": 0,
          "Min Var2": 0,
          "Max Var2": 0,
          "NotNull Var2": 0,
          "Min Var3": 0,
          "Max Var3": 0,
          "NotNull Var3": 0,
          Activa: 1,
          "Solo No Pesado": 0,
          Accion: "",
        })}
        testidPrefix="valcomb"
        addLabel="Agregar regla combinada"
      />
    ),
  },
  {
    value: "origen-noconsiderar",
    label: "Origen_NoConsiderar",
    icon: Ban,
    render: (country) => (
      <ExclusionListTab
        table="Origen_NoConsiderar"
        country={country}
        col="Origen"
        label="Origen"
        intro={<>Lista de orígenes a no considerar. Cada entrada debe ser un entero único.</>}
        testidPrefix="origen"
      />
    ),
  },
  {
    value: "imputacion-excateg",
    label: "Imputacion_ExCateg",
    icon: Filter,
    render: (country) => (
      <ExclusionListTab
        table="Imputacion_ExCateg"
        country={country}
        col="IdProduto"
        label="IdProduto"
        intro={<>Productos excluidos de imputación. Cada IdProduto debe ser un entero único.</>}
        testidPrefix="imput"
      />
    ),
  },
  {
    value: "iddomicilio-prueba",
    label: "IdDomicilio_Prueba",
    icon: Home,
    render: (country) => (
      <ExclusionListTab
        table="IdDomicilio_Prueba"
        country={country}
        col="IdDomicilio"
        label="IdDomicilio"
        intro={<>Domicilios de prueba a excluir. Cada IdDomicilio debe ser un entero único.</>}
        testidPrefix="iddom"
      />
    ),
  },
  {
    value: "idpainel",
    label: "IdPainel",
    icon: Users,
    render: (country) => (
      <GridTab<IdPainelRow>
        table="IdPainel"
        country={country}
        intro={<>Identificadores de panel (J / PD). Ambos deben ser enteros.</>}
        columns={IDPAINEL_COLS}
        validate={validateIdPainel}
        newRow={() => ({ IdPainel_J: 0, IdPainel_PD: 0 })}
        testidPrefix="idpainel"
        addLabel="Agregar panel"
      />
    ),
  },
  {
    value: "variables",
    label: "Variables",
    icon: VariableIcon,
    render: (country) => (
      <GridTab<VariablesRow>
        table="Variables"
        country={country}
        intro={<>Variables clave-valor (texto libre). <span className="font-mono">Variable</span> debe ser única y <span className="font-mono">Valor</span> no vacío.</>}
        columns={VARIABLES_COLS}
        validate={validateVariables}
        newRow={() => ({ Variable: "", Valor: "" })}
        testidPrefix="vars"
        addLabel="Agregar variable"
      />
    ),
  },
  {
    value: "parametros-region",
    label: "Parametros_Region",
    icon: MapPin,
    render: (country) => (
      <GridTab<ParametrosRegionRow>
        table="Parametros_Region"
        country={country}
        intro={<>Factores por región. <span className="font-mono">R</span> es un entero único; los factores admiten decimales.</>}
        columns={REGION_COLS}
        validate={validateParametrosRegion}
        newRow={() => ({ R: 0, f_fill_flex: 0, f_fill_strict: 0, f_ok: 0, f_ok_flex: 0 })}
        testidPrefix="region"
        addLabel="Agregar región"
      />
    ),
  },
  {
    value: "criterios-datas",
    label: "Criterios_Elegibilidad_Datas",
    icon: CalendarRange,
    render: (country) => (
      <GridTab<CriteriosDatasRow>
        table="Criterios_Elegibilidad_Datas"
        country={country}
        intro={<>Ventanas de fechas. <span className="font-mono">Data_Saida</span> es obligatoria.</>}
        columns={DATAS_COLS}
        validate={validateCriteriosDatas}
        newRow={() => ({ Data_Entrada: "", Data_Saida: "" })}
        testidPrefix="datas"
        addLabel="Agregar fecha"
      />
    ),
  },
  {
    value: "criterios-excateg",
    label: "Criterios_Elegibilidad_ExCateg",
    icon: Tag,
    render: (country) => (
      <GridTab<CriteriosExCategRow>
        table="Criterios_Elegibilidad_ExCateg"
        country={country}
        intro={<><span className="font-mono">ExCateg</span> es obligatoria y <span className="font-mono">IdProduto</span> debe ser un entero.</>}
        columns={EXCATEG_COLS}
        validate={validateCriteriosExCateg}
        newRow={() => ({ ExCateg: "", IdProduto: 0 })}
        testidPrefix="exccateg"
        addLabel="Agregar exclusión"
      />
    ),
  },
]
