import React, { useEffect, useRef } from 'react';
import mermaid from 'mermaid';

interface MermaidChartProps {
  chart: string;
}

export const MermaidChart: React.FC<MermaidChartProps> = ({ chart }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current && chart) {
      mermaid.initialize({ startOnLoad: false, theme: 'dark' });
      mermaid.render(`mermaid-${Math.random().toString(36).substring(2, 9)}`, chart)
        .then(({ svg }) => {
          if (containerRef.current) {
            containerRef.current.innerHTML = svg;
          }
        })
        .catch(err => {
          console.error("Mermaid parsing error:", err);
          if (containerRef.current) {
            containerRef.current.innerHTML = `
              <div style="color: #ef4444; font-family: monospace; padding: 10px; background: rgba(239,68,68,0.1); border-radius: 4px; margin-bottom: 10px;">
                Syntax Error in Mermaid string: ${err.message || 'Parse error'}
              </div>
              <pre style="background: #020617; padding: 16px; border-radius: 8px; color: #cbd5e1; font-size: 0.75rem; overflow-x: auto; border: 1px solid #1e293b; white-space: pre-wrap;">${chart.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
            `;
          }
        });
    }
  }, [chart]);

  return <div ref={containerRef} style={{ padding: '16px', background: '#020617', borderRadius: '12px', overflow: 'auto' }} />;
};
