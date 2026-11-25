/**
 * The side panel: saved details that feed Auto-fill, signature and initials,
 * and the tools for placing things by hand.
 */
import { ownerOf } from '../engine/autofill';
import type { DateFormat, Profile } from '../engine/profile';
import { formatDate } from '../engine/profile';
import type { Tool } from '../state/editor';
import { useWorkspace } from './context';
import { Icon, type IconName } from './Icons';

const DETAILS: { key: keyof Omit<Profile, 'dateFormat'>; label: string; auto: string; half?: boolean; type?: string }[] = [
  { key: 'fullName', label: 'Full name', auto: 'name' },
  { key: 'company', label: 'Company', auto: 'organization' },
  { key: 'title', label: 'Title', auto: 'organization-title' },
  { key: 'email', label: 'Email', auto: 'email', type: 'email' },
  { key: 'phone', label: 'Phone', auto: 'tel', type: 'tel' },
  { key: 'street', label: 'Street address', auto: 'address-line1' },
  { key: 'city', label: 'City', auto: 'address-level2' },
  { key: 'state', label: 'State', auto: 'address-level1', half: true },
  { key: 'zip', label: 'ZIP', auto: 'postal-code', half: true },
];

const TOOLS: { tool: Tool; label: string; icon: IconName }[] = [
  { tool: 'signature', label: 'Signature', icon: 'signature' },
  { tool: 'initials', label: 'Initials', icon: 'initials' },
  { tool: 'text', label: 'Text', icon: 'text' },
  { tool: 'date', label: 'Date', icon: 'calendar' },
  { tool: 'check', label: 'Check', icon: 'check' },
];

interface Props {
  onAutofill: () => void;
  onNext: () => void;
  onForget: () => void;
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ onAutofill, onNext, onForget, open, onClose }: Props) {
  const { doc, state, dispatch, saved, updateSaved, requestInk } = useWorkspace();
  const profile = saved.profile;
  const setProfile = (patch: Partial<Profile>) => updateSaved({ profile: { ...profile, ...patch } });

  const taken = new Set(state.present.items.map((it) => it.fieldId));
  const mine = doc.fields.filter((f) => ownerOf(f, doc.blocks, profile) !== 'other');
  const left = mine.filter((f) => !taken.has(f.id)).length;
  const today = new Date();

  const pick = (tool: Tool) => {
    if ((tool === 'signature' || tool === 'initials') && !saved[tool]) {
      requestInk(tool, () => dispatch({ type: 'tool', tool }));
      return;
    }
    dispatch({ type: 'tool', tool: state.tool === tool ? null : tool });
    onClose();
  };

  return (
    <aside className={`sidebar${open ? ' is-open' : ''}`} aria-label="Details and tools">
      <button className="sidebar-grip" aria-label="Close panel" onClick={onClose} />
      {doc.sealed && (
        <div className="notice">
          <Icon name="lock" size={18} />
          <p>
            <strong>This PDF carries a digital seal</strong> (for example from DocuSign). Any edit, here or in any other editor,
            ends that seal: your download keeps everything visible on the page but will no longer verify as the sealed original.
            To add to the same envelope, sign inside the service that sent it.
          </p>
        </div>
      )}

      <section className="panel">
        <button className="button button-primary button-wide" onClick={onAutofill}>
          <Icon name="sparkle" size={18} />
          Auto-fill
        </button>
        <p className="panel-status">
          {mine.length === 0 && doc.widgets.length === 0
            ? 'No blanks were detected. Use the tools below to place text or a signature anywhere.'
            : left === 0
              ? 'Every detected blank is filled.'
              : `${left} of ${mine.length} blanks left.`}
          {left > 0 && (
            <button className="link" onClick={onNext}>
              Next blank
            </button>
          )}
        </p>
      </section>

      <section className="panel">
        <h3>Add to document</h3>
        <div className="tools">
          {TOOLS.map((t) => (
            <button key={t.tool} className={`tool${state.tool === t.tool ? ' is-on' : ''}`} aria-pressed={state.tool === t.tool} onClick={() => pick(t.tool)}>
              <Icon name={t.icon} />
              <span>{t.label}</span>
            </button>
          ))}
        </div>
        <div className="inks">
          {(['signature', 'initials'] as const).map((role) => (
            <button key={role} className="ink" onClick={() => requestInk(role)} aria-label={`${saved[role] ? 'Change' : 'Create'} ${role}`}>
              {saved[role] ? <img src={saved[role]!.src} alt="" /> : <span className="ink-empty">Create {role}</span>}
              <span className="ink-action">{saved[role] ? 'Change' : 'Add'}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <h3>Your details</h3>
        <div className="details">
          {DETAILS.map((d) => (
            <label key={d.key} className={`field${d.half ? ' is-half' : ''}`}>
              <span>{d.label}</span>
              <input className="input" type={d.type ?? 'text'} autoComplete={d.auto} value={profile[d.key]} onChange={(e) => setProfile({ [d.key]: e.target.value })} />
            </label>
          ))}
          <label className="field">
            <span>Date style</span>
            <select className="input" value={profile.dateFormat} onChange={(e) => setProfile({ dateFormat: e.target.value as DateFormat })}>
              {(['long', 'us', 'iso'] as const).map((f) => (
                <option key={f} value={f}>
                  {formatDate(today, f)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="panel-foot">
          <Icon name="lock" size={14} />
          Saved in this browser only.
          <button className="link" onClick={onForget}>
            Forget
          </button>
        </p>
      </section>
    </aside>
  );
}
