import { useSchemaStore } from '../../store/useSchemaStore.js'
import { useQueryStore } from '../../store/useQueryStore.js'

const STAGE_TYPES = ['$match', '$group', '$project', '$sort', '$limit', '$skip', '$lookup', '$unwind', '$addFields']

const OPS_MONGO = ['$eq', '$ne', '$gt', '$gte', '$lt', '$lte', '$regex', '$in']

export function MongoStagesPane() {
  const tables = useSchemaStore(s => s.tables)
  const {
    qTables, qPipelineStages,
    addStage, updateStageConfig, removeStage, moveStage,
  } = useQueryStore()

  const allCollections = [...qTables]
  const main = allCollections[0] || ''
  const allFields = main ? (tables[main]?.cols || []).map(c => c.name) : []

  function updateConfig(i, patch) {
    updateStageConfig(i, patch)
  }

  return (
    <div className="mongo-stages">
      <div className="mongo-stages-toolbar">
        <span className="mongo-stages-hd">Pipeline stages</span>
        <select
          className="mongo-add-sel"
          value=""
          onChange={e => { if (e.target.value) addStage(e.target.value) }}
        >
          <option value="">+ Aggiungi stage…</option>
          {STAGE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {!qPipelineStages.length && (
        <div className="mongo-stages-empty">
          Nessuno stage definito — il builder usa la pipeline automatica.<br />
          <span style={{ fontSize: 10, opacity: .7 }}>Aggiungi stages per controllare manualmente la pipeline.</span>
        </div>
      )}

      {qPipelineStages.map((stage, i) => (
        <div key={stage.id} className="mongo-stage-block">
          <div className="mongo-stage-hd">
            <span className="mongo-stage-type">{stage.type}</span>
            <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
              <button className="mongo-stage-mv" onClick={() => moveStage(i, -1)} title="Su" disabled={i === 0}>▲</button>
              <button className="mongo-stage-mv" onClick={() => moveStage(i, 1)} title="Giù" disabled={i === qPipelineStages.length - 1}>▼</button>
              <button className="brm" onClick={() => removeStage(i)}>×</button>
            </div>
          </div>

          <div className="mongo-stage-body">
            {stage.type === '$match' && (
              <MatchConfig
                config={stage.config}
                allFields={allFields}
                onChange={c => updateConfig(i, c)}
              />
            )}
            {stage.type === '$group' && (
              <GroupConfig
                config={stage.config}
                allFields={allFields}
                onChange={c => updateConfig(i, c)}
              />
            )}
            {stage.type === '$project' && (
              <ProjectConfig
                config={stage.config}
                allFields={allFields}
                onChange={c => updateConfig(i, c)}
              />
            )}
            {stage.type === '$sort' && (
              <SortConfig
                config={stage.config}
                allFields={allFields}
                onChange={c => updateConfig(i, c)}
              />
            )}
            {(stage.type === '$limit' || stage.type === '$skip') && (
              <div className="wrow">
                <label style={{ fontSize: 11, color: 'var(--t2)' }}>{stage.type === '$limit' ? 'Limit' : 'Skip'}</label>
                <input
                  className="val"
                  type="number"
                  min={0}
                  value={stage.config.n ?? 0}
                  onChange={e => updateConfig(i, { n: parseInt(e.target.value, 10) || 0 })}
                  style={{ width: 80 }}
                />
              </div>
            )}
            {stage.type === '$lookup' && (
              <LookupConfig
                config={stage.config}
                allCollections={allCollections}
                onChange={c => updateConfig(i, c)}
              />
            )}
            {stage.type === '$unwind' && (
              <div className="wrow">
                <label style={{ fontSize: 11, color: 'var(--t2)' }}>path</label>
                <input
                  className="val"
                  type="text"
                  placeholder="$fieldName"
                  value={stage.config.path || ''}
                  onChange={e => updateConfig(i, { path: e.target.value })}
                  style={{ flex: 1 }}
                />
              </div>
            )}
            {stage.type === '$addFields' && (
              <AddFieldsConfig
                config={stage.config}
                onChange={c => updateConfig(i, c)}
              />
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Sub-configs ────────────────────────────────────────────────────────────────

function MatchConfig({ config, allFields, onChange }) {
  const conds = config.conditions || []

  function update(idx, patch) {
    const next = [...conds]
    next[idx] = { ...next[idx], ...patch }
    onChange({ conditions: next })
  }

  function add() {
    onChange({ conditions: [...conds, { field: allFields[0] || '', op: '$eq', val: '' }] })
  }

  function remove(idx) {
    onChange({ conditions: conds.filter((_, i) => i !== idx) })
  }

  return (
    <div>
      {conds.map((c, idx) => (
        <div className="wrow" key={idx}>
          <select className="col-sel" value={c.field} onChange={e => update(idx, { field: e.target.value })}>
            {allFields.map(f => <option key={f}>{f}</option>)}
            <option value="__custom__">custom…</option>
          </select>
          {c.field === '__custom__' && (
            <input className="val" type="text" placeholder="campo" value={c.customField || ''}
              onChange={e => update(idx, { customField: e.target.value })} style={{ width: 90 }} />
          )}
          <select className="op-sel" style={{ width: 80 }} value={c.op} onChange={e => update(idx, { op: e.target.value })}>
            {OPS_MONGO.map(o => <option key={o}>{o}</option>)}
          </select>
          <input className="val" type="text" placeholder="valore" value={c.val || ''}
            onChange={e => update(idx, { val: e.target.value })} />
          <button className="brm" onClick={() => remove(idx)}>×</button>
        </div>
      ))}
      <button className="badd" onClick={add}>+ Condizione</button>
    </div>
  )
}

function GroupConfig({ config, allFields, onChange }) {
  const idFields = config.idFields || []
  const accumulators = config.accumulators || []

  const AGG = ['$sum', '$avg', '$min', '$max', '$first', '$last', '$push', '$addToSet']

  return (
    <div>
      <div className="dml-sub-hd" style={{ marginBottom: 4 }}>_id (GROUP BY)</div>
      {idFields.map((f, idx) => (
        <div className="wrow" key={idx}>
          <select className="col-sel" value={f.field} onChange={e => {
            const next = [...idFields]; next[idx] = { ...next[idx], field: e.target.value }
            onChange({ idFields: next })
          }}>
            {allFields.map(f => <option key={f}>{f}</option>)}
          </select>
          <button className="brm" onClick={() => onChange({ idFields: idFields.filter((_, i) => i !== idx) })}>×</button>
        </div>
      ))}
      <button className="badd" onClick={() => onChange({ idFields: [...idFields, { field: allFields[0] || '' }] })}>
        + Campo
      </button>

      <div className="dml-sub-hd" style={{ marginTop: 8, marginBottom: 4 }}>Accumulatori</div>
      {accumulators.map((a, idx) => (
        <div className="wrow" key={idx}>
          <input className="val" type="text" placeholder="alias" value={a.alias || ''}
            style={{ width: 70 }}
            onChange={e => {
              const next = [...accumulators]; next[idx] = { ...next[idx], alias: e.target.value }
              onChange({ accumulators: next })
            }} />
          <select className="op-sel" style={{ width: 80 }} value={a.op}
            onChange={e => {
              const next = [...accumulators]; next[idx] = { ...next[idx], op: e.target.value }
              onChange({ accumulators: next })
            }}>
            {AGG.map(o => <option key={o}>{o}</option>)}
          </select>
          <select className="col-sel" value={a.field}
            onChange={e => {
              const next = [...accumulators]; next[idx] = { ...next[idx], field: e.target.value }
              onChange({ accumulators: next })
            }}>
            <option value="*">* (costante 1)</option>
            {allFields.map(f => <option key={f}>{f}</option>)}
          </select>
          <button className="brm" onClick={() => onChange({ accumulators: accumulators.filter((_, i) => i !== idx) })}>×</button>
        </div>
      ))}
      <button className="badd" onClick={() =>
        onChange({ accumulators: [...accumulators, { alias: 'totale', op: '$sum', field: '*' }] })
      }>
        + Accumulatore
      </button>
    </div>
  )
}

function ProjectConfig({ config, allFields, onChange }) {
  const fields = config.fields || {}

  return (
    <div>
      {allFields.map(f => (
        <label className="gbchk" key={f}>
          <input
            type="checkbox"
            checked={fields[f] !== 0}
            onChange={e => onChange({ fields: { ...fields, [f]: e.target.checked ? 1 : 0 } })}
          />
          {f}
        </label>
      ))}
      {!allFields.length && (
        <span style={{ fontSize: 11, color: 'var(--t3)' }}>Seleziona una collection per scegliere i campi</span>
      )}
    </div>
  )
}

function SortConfig({ config, allFields, onChange }) {
  const sortFields = config.fields || []

  return (
    <div>
      {sortFields.map((s, idx) => (
        <div className="wrow" key={idx}>
          <select className="col-sel" value={s.field} onChange={e => {
            const next = [...sortFields]; next[idx] = { ...next[idx], field: e.target.value }
            onChange({ fields: next })
          }}>
            {allFields.map(f => <option key={f}>{f}</option>)}
          </select>
          <select className="op-sel" style={{ width: 70 }} value={s.dir || 'ASC'} onChange={e => {
            const next = [...sortFields]; next[idx] = { ...next[idx], dir: e.target.value }
            onChange({ fields: next })
          }}>
            <option value="ASC">ASC</option>
            <option value="DESC">DESC</option>
          </select>
          <button className="brm" onClick={() => onChange({ fields: sortFields.filter((_, i) => i !== idx) })}>×</button>
        </div>
      ))}
      <button className="badd" onClick={() =>
        onChange({ fields: [...sortFields, { field: allFields[0] || '', dir: 'ASC' }] })
      }>+ Campo</button>
    </div>
  )
}

function LookupConfig({ config, allCollections, onChange }) {
  const c = config
  const row = (label, key, placeholder) => (
    <div className="alias-row">
      <span className="alias-tbl-name" style={{ minWidth: 90, fontSize: 11 }}>{label}</span>
      <input
        className="alias-tbl-in"
        style={{ flex: 1, width: 'auto' }}
        type="text"
        placeholder={placeholder}
        value={c[key] || ''}
        onChange={e => onChange({ [key]: e.target.value })}
      />
    </div>
  )
  return (
    <div>
      <div className="alias-row">
        <span className="alias-tbl-name" style={{ minWidth: 90, fontSize: 11 }}>from</span>
        <select className="jsel" style={{ flex: 1 }} value={c.from || ''} onChange={e => onChange({ from: e.target.value })}>
          <option value="">-- collection --</option>
          {allCollections.map(n => <option key={n}>{n}</option>)}
        </select>
      </div>
      {row('localField',   'localField',   'campo locale')}
      {row('foreignField', 'foreignField', 'campo esterno')}
      {row('as',           'as',           'alias risultato')}
    </div>
  )
}

function AddFieldsConfig({ config, onChange }) {
  const fields = config.fields || []

  return (
    <div>
      {fields.map((f, idx) => (
        <div className="wrow" key={idx}>
          <input className="val" type="text" placeholder="nome" value={f.name || ''}
            style={{ width: 80 }}
            onChange={e => {
              const next = [...fields]; next[idx] = { ...next[idx], name: e.target.value }
              onChange({ fields: next })
            }} />
          <span style={{ fontSize: 11, color: 'var(--t3)' }}>=</span>
          <input className="val" type="text" placeholder="$expr o valore" value={f.expr || ''}
            style={{ flex: 1 }}
            onChange={e => {
              const next = [...fields]; next[idx] = { ...next[idx], expr: e.target.value }
              onChange({ fields: next })
            }} />
          <button className="brm" onClick={() => onChange({ fields: fields.filter((_, i) => i !== idx) })}>×</button>
        </div>
      ))}
      <button className="badd" onClick={() => onChange({ fields: [...fields, { name: '', expr: '' }] })}>
        + Campo
      </button>
    </div>
  )
}
