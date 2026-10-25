import { apiClient } from '../utils/apiClient';
import React, { useState } from 'react';

interface KnowledgeNode {
  id: string;
  type: string;
  chunk_count?: number;
}

interface KnowledgeProps {
  knowledgeList: KnowledgeNode[];
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDelete: (sourceId: string) => void;
  uploading: boolean;
  status: { type: string; text: string };
  apiBase: string;
}

const KnowledgeCenter: React.FC<KnowledgeProps> = ({ knowledgeList, onUpload, onDelete, uploading, status, apiBase }) => {
  const [testQuery, setTestQuery] = useState('');
  const [testResult, setTestResult] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [expandedResultIds, setExpandedResultIds] = useState<Record<string, boolean>>({});
  const [fullDocuments, setFullDocuments] = useState<Record<string, string>>({});
  const [loadingDocs, setLoadingDocs] = useState<Record<string, boolean>>({});
  const totalSemanticNodes = knowledgeList.reduce((sum, node) => sum + (node.chunk_count || 1), 0);
  const totalRealDocuments = knowledgeList.length;

  const handleTestBrain = async () => {
    if (!testQuery.trim()) return;

    setSearching(true);
    setQueryError(null);

    try {
      const response = await fetch(`${apiBase}/api/knowledge/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: testQuery, n_results: 3 })
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.detail || data.message || `Query failed with HTTP ${response.status}`);
      }

      setTestResult(data.results || []);
    } catch (error) {
      console.error('Recall failed:', error);
      setTestResult([]);
      setQueryError(error instanceof Error ? error.message : 'Recall failed.');
    } finally {
      setSearching(false);
    }
  };

  const handleViewFullDocument = async (sourceId: string, resultKey: string) => {
    if (!sourceId) return;
    
    // Toggle off if already expanded and loaded
    if (expandedResultIds[resultKey] && fullDocuments[resultKey]) {
      setExpandedResultIds(prev => ({ ...prev, [resultKey]: false }));
      return;
    }

    setLoadingDocs(prev => ({ ...prev, [resultKey]: true }));
    try {
      const response = await fetch(`${apiBase}/api/knowledge/document/${encodeURIComponent(sourceId)}`);
      if (!response.ok) throw new Error('Failed to fetch full document');
      const data = await response.json();
      
      setFullDocuments(prev => ({ ...prev, [resultKey]: data.content }));
      setExpandedResultIds(prev => ({ ...prev, [resultKey]: true }));
    } catch (error) {
      console.error('Failed to load full document:', error);
      alert('Failed to load full document. It may have been deleted or is unavailable.');
    } finally {
      setLoadingDocs(prev => ({ ...prev, [resultKey]: false }));
    }
  };

  const handleDelete = async (sourceId: string) => {
    if (!window.confirm(`Remove "${sourceId}" from the knowledge base?`)) return;
    setDeletingId(sourceId);
    try {
      await onDelete(sourceId);
    } finally {
      setDeletingId(null);
    }
  };

  const getDisplayName = (node: KnowledgeNode): string => node.id.replace(/_chunk_\d+$/, '');

  const getTypeLabel = (type: string): string => {
    switch (type) {
      case 'synthesis_sample': return 'AI Synthesis';
      case 'test_plan': return 'AI Test Plan';
      case 'enterprise_template': return 'Enterprise Template';
      case 'historical_sample': return 'Golden Sample';
      default: return type?.replace(/_/g, ' ') || 'Document';
    }
  };

  const getTypeBadgeClass = (type: string): string => {
    if (type === 'synthesis_sample' || type === 'test_plan') return 'type-human';
    if (type === 'enterprise_template') return 'type-template';
    return 'type-legacy';
  };

  const getResultKey = (res: any, index: number) => res?.memory_key || res?.id || `${index}`;

  const toggleExpanded = (key: string) => {
    setExpandedResultIds(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const topResult = testResult[0];
  const topResultSnippet = topResult?.content
    ? `${topResult.content.slice(0, 1000)}${topResult.content.length > 1000 ? '...' : ''}`
    : '';

  return (
    <div className="card animate-fadeIn knowledge-center-shell">
      <div className="card-header border-none">
        <div className="header-flex">
          <div>
            <h2 className="title-gradient">Chroma Semantic Brain</h2>
            <p>Enterprise long-term memory for high-fidelity RAG synthesis.</p>
          </div>
          <div className="brain-stats">
            <div className="stat-pill">
              <span className="label">Semantic Nodes</span>
              <span className="value">{totalSemanticNodes}</span>
            </div>
            <div className="stat-pill">
              <span className="label">Real Documents</span>
              <span className="value">{totalRealDocuments}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="operational-banner">
        <i className="ti-info-alt" aria-hidden="true" />
        <span>Operational Guide: The Semantic Brain stores enterprise long-term memory. Use the <strong>Discovery Playground</strong> to test RAG recall logic before drafting a strategic session.</span>
      </div>

      <div className="card-body grid-split">
        <div className="collection-panel">
          <h3 className="section-title">Knowledge Embedding Pipeline</h3>
          <div className="dropzone-modern animate-pulse-slow">
            <input type="file" id="spec-upload" className="hide" onChange={onUpload} disabled={uploading} aria-label="Upload knowledge source" accept=".pdf,.docx,.txt,.md,.csv,.xlsx" />
            <label htmlFor="spec-upload" className="dropzone-label">
              <i className="ti-cloud-up" aria-hidden="true"></i>
              <span className="dropzone-text">Drop Spec File or Click to Vectorize</span>
              <span className="dropzone-sub">Supports PDF, DOCX, XLSX, CSV, TXT, MD</span>
            </label>
            {uploading && (
              <div className="progress-bar-container" role="progressbar" aria-label="Synthesizing Knowledge Nodes">
                <div className="progress-fill animate-progress"></div>
                <span className="progress-label">Synthesizing Semantic Nodes...</span>
              </div>
            )}
          </div>

          <div className="discovery-playground mt-6">
            <h3 className="section-title">Recall Discovery Playground</h3>
            <div className="discovery-input-bus">
              <input
                type="text"
                id="brain-query-input"
                aria-label="Semantic brain recall query"
                className="modern-input"
                placeholder="Test the Brain's recall logic..."
                value={testQuery}
                onChange={(e) => setTestQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleTestBrain()}
              />
              <button
                className={`btn-primary-mini ${searching ? 'active' : ''}`}
                onClick={handleTestBrain}
                disabled={searching}
                aria-label="Execute search"
                style={{ height: '42px', padding: '0 20px', borderRadius: '10px' }}
              >
                {searching ? 'Recalling...' : 'Query Hub'}
              </button>
            </div>

            {queryError && (
              <div className="knowledge-query-error" role="alert">
                {queryError}
              </div>
            )}

            <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div className="knowledge-stream-caption">
                <i className="ti-comments knowledge-stream-caption-icon"></i> Institutional Memory Stream
              </div>

              <div className="knowledge-stream-panel">
                {searching ? (
                  <div className="knowledge-stream-status">
                    <span className="telemetry-pulse-dot knowledge-stream-dot"></span>
                    <span className="knowledge-stream-status-text">Agent #53 is traversing the knowledge graph...</span>
                  </div>
                ) : testQuery && testResult.length > 0 ? (
                  <div className="animate-fadeIn">
                    <div className="knowledge-stream-turn knowledge-stream-turn-user">
                      <div className="knowledge-stream-avatar knowledge-stream-avatar-user">
                        <i className="ti-user"></i>
                      </div>
                      <div className="knowledge-stream-bubble knowledge-stream-bubble-user">
                        {testQuery}
                      </div>
                    </div>

                    <div className="knowledge-stream-turn knowledge-stream-turn-brain">
                      <div className="knowledge-stream-avatar knowledge-stream-avatar-brain">
                        <i className="ti-package"></i>
                      </div>
                        <div className="knowledge-stream-bubble knowledge-stream-bubble-brain">
                          <div className="knowledge-stream-bubble-heading">Knowledge Graph Match</div>
                          <span>
                            {topResultSnippet || `I've located ${testResult.length} semantic fragments related to your query.`}
                          </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="knowledge-stream-empty">
                    Ask a technical or historical question to activate Institutional Memory.
                  </div>
                )}
              </div>
            </div>

            {testResult.length > 0 && (
              <div className="discovery-results animate-slideIn" aria-live="polite">
                <p className="discovery-label">Top Semantic Matches:</p>
                <div role="list">
                  {testResult.map((res, i) => (
                    <div key={i} className="discovery-hit" role="listitem">
                      <i className="ti-target text-primary" aria-hidden="true" />
                      <div className="discovery-hit-content">
                        <span className="hit-id">{res.id}</span>
                        <div className="hit-badges">
                          <span className="hit-match">
                            {Math.round((res.similarity ?? res.confidence ?? 0) * 100)}% Similarity
                          </span>
                          <span className={`hit-type-badge ${res.metadata?.type === 'enterprise_template' ? 'template' : 'sample'}`}>
                            {res.metadata?.type?.replace(/_/g, ' ') || 'Fragment'}
                          </span>
                          {res.confidence_band && (
                            <span className="hit-type-badge sample">{res.confidence_band}</span>
                          )}
                          {res.domain && (
                            <span className="hit-type-badge template">{String(res.domain).replace(/_/g, ' ')}</span>
                          )}
                        </div>
                        {res.content && (
                          <div className="hit-snippet">
                            <p style={{ whiteSpace: 'pre-wrap' }}>
                              {expandedResultIds[getResultKey(res, i)] && fullDocuments[getResultKey(res, i)]
                                ? fullDocuments[getResultKey(res, i)]
                                : res.content}
                            </p>
                            
                            {res.source && (
                              <button
                                type="button"
                                className="btn-link"
                                onClick={() => handleViewFullDocument(res.source, getResultKey(res, i))}
                                style={{ padding: 0, marginTop: '10px', fontWeight: 600 }}
                                disabled={loadingDocs[getResultKey(res, i)]}
                              >
                                {loadingDocs[getResultKey(res, i)] 
                                  ? 'Loading full document...' 
                                  : expandedResultIds[getResultKey(res, i)] && fullDocuments[getResultKey(res, i)]
                                    ? 'Show Less' 
                                    : 'View Full Document'}
                              </button>
                            )}
                          </div>
                        )}
                        <div className="hit-meta-line" style={{ marginTop: '8px', fontSize: '0.82rem', color: '#64748b', display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
                          <span>
                            Source: <strong>{res.source || res.metadata?.source || 'Unknown'}</strong>
                          </span>
                          {typeof res.chunk_index === 'number' && !expandedResultIds[getResultKey(res, i)] && (
                            <span>
                              Chunk: <strong>{res.chunk_index + 1}</strong>
                              {typeof res.total_chunks === 'number' ? ` / ${res.total_chunks}` : ''}
                            </span>
                          )}
                          {expandedResultIds[getResultKey(res, i)] && typeof res.total_chunks === 'number' && (
                            <span>
                              Full Document <strong>({res.total_chunks} Chunks Merged)</strong>
                            </span>
                          )}
                          {res.decision && (
                            <span>
                              Decision: <strong>{res.decision}</strong>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!searching && testQuery && testResult.length === 0 && (
              <div className="empty-discovery">
                <i className="ti-search" aria-hidden="true"></i>
                <p>No conceptual matches found for "{testQuery}".</p>
              </div>
            )}
          </div>
        </div>

        <div className="indexed-nodes">
          <h3 className="section-title">Active RAG Manifest</h3>
          <div className="node-list custom-scroll" role="list">
            {knowledgeList.length === 0 ? (
              <div className="empty-nodes">
                <i className="ti-layers-alt" aria-hidden="true"></i>
                <p>No semantic nodes in long-term memory.</p>
              </div>
            ) : (
              knowledgeList.map((node, i) => {
                const displayName = getDisplayName(node);
                const isDeleting = deletingId === node.id;
                return (
                  <div key={i} className={`node-item animate-slideIn ${isDeleting ? 'opacity-50' : ''}`} role="listitem">
                    <div className="node-top">
                      <div className="node-meta">
                        <i className="ti-file" aria-hidden="true"></i>
                        <div>
                          <h4 title={node.id}>{displayName}</h4>
                          {node.chunk_count && node.chunk_count > 1 && (
                            <span className="node-chunk-count">
                              {node.chunk_count} semantic chunks
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        className="btn-icon-trash"
                        title="Prune Memory Node"
                        aria-label={`Delete knowledge node ${displayName}`}
                        disabled={isDeleting}
                        onClick={() => handleDelete(node.id)}
                      >
                        <i className={`ti-${isDeleting ? 'reload' : 'trash'}`} aria-hidden="true" />
                      </button>
                    </div>
                    <div className="node-tags">
                      <span className={`node-tag ${getTypeBadgeClass(node.type)}`}>
                        {getTypeLabel(node.type)}
                      </span>
                      <span className="node-tag audit">Vectored Hub</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default KnowledgeCenter;
