/**
 * The side panel: saved details that feed Auto-fill, signature and initials,
 * and the tools for placing things by hand.
 */
import type { ReactNode } from 'react';
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
  { key: 'street', label: 'Street', auto: 'address-line1' },
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
  top: ReactNode;
  onAutofill: () => void;
  onNext: () => void;
  onForget: () => void;
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ top, onAutofill, onNext, onForget, open, onClose }: Props) {
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
      {top}
      {doc.sealed && (
        <div className="notice">
          <Icon name="lock" size={16} />
          <p>Digitally sealed PDF. Editing voids the seal.</p>
        </div>
      )}

      <section className="panel">
        <button className="button button-reactor button-wide" onClick={onAutofill}>
          Auto-fill
        </button>
        <p className="panel-status">
          {mine.length === 0 && doc.widgets.length === 0 ? 'No blanks found' : left === 0 ? 'All blanks filled' : `${left} of ${mine.length} left`}
          {left > 0 && (
            <button className="link" onClick={onNext}>
              Next
            </button>
          )}
        </p>
      </section>

      <section className="panel">
        <h3>Add</h3>
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
              {saved[role] ? <img src={saved[role]!.src} alt="" /> : <span className="ink-empty">{role === 'signature' ? 'Signature' : 'Initials'}</span>}
              <span className="ink-action">{saved[role] ? 'Change' : 'Create'}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <h3>Details</h3>
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
          Saved on this device
          <button className="link" onClick={onForget}>
            Clear
          </button>
        </p>
      </section>
    </aside>
  );
}
