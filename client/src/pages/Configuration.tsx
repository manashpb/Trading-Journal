import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Trash2, Pencil } from 'lucide-react';
import {
  fetchInstruments, createInstrument, updateInstrument, deleteInstrument,
  fetchTagCategories, createTagCategory, createTag, deleteTag, deleteTagCategory,
} from '../api';
import type { Instrument, TagCategory } from '../types';

export default function Configuration() {
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [categories, setCategories] = useState<TagCategory[]>([]);
  const [loading, setLoading] = useState(true);

  // Instruments form state
  const [instName, setInstName] = useState('');
  const [instType, setInstType] = useState<'CFD' | 'Futures'>('CFD');
  const [instPV, setInstPV] = useState('');
  const [editInst, setEditInst] = useState<Instrument | null>(null);

  // Tag form state
  const [catName, setCatName] = useState('');
  const [newTagForCat, setNewTagForCat] = useState<Record<number, string>>({});

  useEffect(() => {
    loadInstruments();
    loadTags();
  }, []);

  async function loadInstruments() {
    try {
      const data = await fetchInstruments();
      setInstruments(data);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadTags() {
    try {
      const data = await fetchTagCategories();
      setCategories(data);
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  // ── Instrument CRUD ──────────────────────────────────────
  async function saveInstrument(e: React.FormEvent) {
    e.preventDefault();
    if (!instName.trim()) return toast.error('Instrument name is required');
    if (!instPV || isNaN(Number(instPV))) return toast.error('Point value must be a number');
    try {
      if (editInst) {
        await updateInstrument(editInst.id, { name: instName.trim(), type: instType, pointValue: Number(instPV) });
        toast.success('Instrument updated');
      } else {
        await createInstrument({ name: instName.trim(), type: instType, pointValue: Number(instPV) });
        toast.success('Instrument added');
      }
      setInstName(''); setInstPV(''); setEditInst(null);
      loadInstruments();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function removeInstrument(id: number) {
    if (!confirm('Delete this instrument? This only works if no trades reference it.')) return;
    try {
      await deleteInstrument(id);
      loadInstruments();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  // ── Tag CRUD ──────────────────────────────────────────────
  async function addCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!catName.trim()) return toast.error('Category name is required');
    try {
      await createTagCategory(catName.trim());
      setCatName('');
      loadTags();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function addTag(categoryId: number) {
    const name = (newTagForCat[categoryId] ?? '').trim();
    if (!name) return toast.error('Tag name is required');
    try {
      await createTag(categoryId, name);
      setNewTagForCat(prev => ({ ...prev, [categoryId]: '' }));
      loadTags();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function removeTag(tagId: number) {
    try {
      await deleteTag(tagId);
      loadTags();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function removeCategory(catId: number) {
    if (!confirm('Delete this category and all its tags?')) return;
    try {
      await deleteTagCategory(catId);
      loadTags();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Configuration</h2>
          <div className="sub">Manage instruments, point values, and trade tags</div>
        </div>
      </div>

      {/* ── Instruments ──────────────────────────────────── */}
      <section style={{ marginBottom: 36 }}>
        <h3 style={{ fontSize: 17, fontWeight: 600, marginBottom: 14 }}>Instruments</h3>

        <div className="card">
          <form onSubmit={saveInstrument}>
            <div className="form-grid" style={{ alignItems: 'flex-end' }}>
              <div className="form-field">
                <label>Instrument Name <span style={{ color: '#f87171' }}>*</span></label>
                <input className="input" value={instName} onChange={e => setInstName(e.target.value)}
                  placeholder="e.g. NIFTY 50, EURUSD" />
              </div>
              <div className="form-field">
                <label>Contract Type <span style={{ color: '#f87171' }}>*</span></label>
                <select className="select" value={instType} onChange={e => setInstType(e.target.value as any)}>
                  <option value="CFD">CFD</option>
                  <option value="Futures">Futures</option>
                </select>
              </div>
              <div className="form-field">
                <label>Per Point PnL (₹) <span style={{ color: '#f87171' }}>*</span></label>
                <input type="number" step="0.01" className="input" value={instPV} onChange={e => setInstPV(e.target.value)}
                  placeholder="e.g. 250.00" />
              </div>
              <div className="form-field" style={{ display: 'flex', flexDirection: 'row', gap: 8 }}>
                <button type="submit" className="btn btn-primary">{editInst ? 'Update' : 'Add Instrument'}</button>
                {editInst && (
                  <button type="button" className="btn" onClick={() => { setEditInst(null); setInstName(''); setInstPV(''); }}>
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </form>
        </div>

        {/* Instrument list */}
        {loading ? <div className="loading">Loading...</div> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12, marginTop: 16 }}>
            {instruments.map(inst => (
              <div key={inst.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{inst.name}</div>
                  <div style={{ fontSize: 12, color: '#94a3b8' }}>{inst.type} · ₹{inst.pointValue.toLocaleString('en-IN')}/pt</div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="icon-btn" title="Edit"
                    onClick={() => {
                      setEditInst(inst);
                      setInstName(inst.name);
                      setInstType(inst.type);
                      setInstPV(String(inst.pointValue));
                    }}>
                    <Pencil size={13} />
                  </button>
                  <button className="icon-btn" title="Delete" onClick={() => removeInstrument(inst.id)}><Trash2 size={13} /></button>
                </div>
              </div>
            ))}
            {instruments.length === 0 && <div className="empty-state"><p>No instruments added yet</p></div>}
          </div>
        )}
      </section>

      {/* ── Tags ──────────────────────────────────────────── */}
      <section>
        <h3 style={{ fontSize: 17, fontWeight: 600, marginBottom: 14 }}>Tag Categories & Tags</h3>

        <form onSubmit={addCategory} style={{ marginBottom: 16 }}>
          <div className="card" style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div className="form-field" style={{ minWidth: 240 }}>
              <label>New Category Name</label>
              <input className="input" value={catName} onChange={e => setCatName(e.target.value)}
                placeholder="e.g. Setup Type, Market Regime" />
            </div>
            <button type="submit" className="btn btn-primary" style={{ height: 36 }}><Plus size={14} /> Add Category</button>
          </div>
        </form>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 14 }}>
          {categories.map(cat => (
            <div key={cat.id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h4 style={{ fontSize: 14, fontWeight: 600 }}>{cat.name}</h4>
                <button className="icon-btn" title="Delete category" onClick={() => removeCategory(cat.id)}><Trash2 size={13} /></button>
              </div>

              <div className="tags-grid" style={{ marginBottom: 12 }}>
                {cat.tags.length === 0 && <span style={{ fontSize: 12, color: '#64748b' }}>No tags yet</span>}
                {cat.tags.map(tag => (
                  <span key={tag.id} className="tag-pill" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    {tag.name}
                    <button onClick={() => removeTag(tag.id)}><Trash2 size={11} /></button>
                  </span>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <input className="input" style={{ flex: 1 }} placeholder="New tag name"
                  value={newTagForCat[cat.id] ?? ''}
                  onChange={e => setNewTagForCat(prev => ({ ...prev, [cat.id]: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(cat.id); } }} />
                <button className="btn btn-primary btn-sm" onClick={() => addTag(cat.id)}><Plus size={14} /> Add</button>
              </div>
            </div>
          ))}

          {categories.length === 0 && <div className="empty-state"><p>No tag categories yet — create one above</p></div>}
        </div>
      </section>
    </div>
  );
}