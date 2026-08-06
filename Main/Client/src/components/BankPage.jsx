import { useProject } from '../project/ProjectContext.jsx'
import './BankPage.css'

export default function BankPage() {
  const { CurrentDoc, UpdateBody } = useProject()

  const count = () =>
    (CurrentDoc.body || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).length

  return (
    <div class="bp">
      <div class="bp-page">
        <div class="bp-head">
          <div class="bp-name">{CurrentDoc.meta?.name}</div>
          <div class="bp-sub">{count()} entries · one per line · used by generator tokens like <span class="bp-tok">/{CurrentDoc.meta?.name}</span></div>
        </div>
        <textarea
          class="bp-area mono"
          placeholder="One entry per line"
          value={CurrentDoc.body || ''}
          onInput={(e) => UpdateBody(e.currentTarget.value)}
        />
      </div>
    </div>
  )
}
