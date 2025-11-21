import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

// Basic styling for the report page
const styles = {
  container: {
    padding: '20px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    backgroundColor: '#f8f9fa',
    color: '#212529'
  },
  header: {
    borderBottom: '2px solid #dee2e6',
    paddingBottom: '10px',
    marginBottom: '20px',
  },
  metaInfo: {
    marginBottom: '20px',
    padding: '10px',
    backgroundColor: '#e9ecef',
    borderRadius: '5px',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as React.CSSProperties['borderCollapse'],
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  },
  th: {
    backgroundColor: '#343a40',
    color: 'white',
    padding: '12px',
    textAlign: 'left' as React.CSSProperties['textAlign'],
    border: '1px solid #495057',
  },
  td: {
    padding: '10px',
    border: '1px solid #dee2e6',
    verticalAlign: 'top',
    fontSize: '14px',
    maxWidth: '250px',
    overflowWrap: 'break-word',
  } as React.CSSProperties,
  tr: {
    backgroundColor: '#ffffff',
  },
  trEven: {
    backgroundColor: '#f8f9fa',
  },
  code: {
    fontFamily: 'monospace',
    backgroundColor: '#e9ecef',
    padding: '2px 4px',
    borderRadius: '3px',
    fontSize: '13px',
  },
  badge: {
    display: 'inline-block',
    padding: '4px 8px',
    fontSize: '12px',
    fontWeight: 'bold',
    color: '#fff',
    backgroundColor: '#007bff',
    borderRadius: '10px',
    marginRight: '5px',
    marginBottom: '5px',
  }
};

const ReportValue = ({ value }: { value: any }) => {
  if (typeof value === 'boolean') {
    return <span style={{ color: value ? 'green' : 'red' }}>{String(value)}</span>;
  }
  if (value === null || value === undefined) {
    return <i style={{ color: '#6c757d' }}>null</i>;
  }
  if (Array.isArray(value)) {
    return (
      <div>
        {value.map((item, index) => (
          <span key={index} style={styles.badge}>{item}</span>
        ))}
      </div>
    );
  }
  if (typeof value === 'object') {
    return <pre style={styles.code}>{JSON.stringify(value, null, 2)}</pre>;
  }
  return String(value);
};

const AnalysisReport = () => {
  const [report, setReport] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    chrome.storage.local.get(['analysisReport'], (result) => {
      if (chrome.runtime.lastError) {
        setError('Error retrieving analysis report.');
        console.error(chrome.runtime.lastError);
      } else if (result.analysisReport) {
        setReport(result.analysisReport);
        chrome.storage.local.remove(['analysisReport']);
      } else {
        setError('No analysis report found in storage.');
      }
    });
  }, []);

  if (error) {
    return <div style={styles.container}><h1 style={styles.header}>Error</h1><p style={{ color: 'red' }}>{error}</p></div>;
  }

  if (!report) {
    return <div style={styles.container}><h1 style={styles.header}>Loading report...</h1></div>;
  }

  const { url, title, timestamp, count, scannedFrames, elements } = report;

  return (
    <div style={styles.container}>
      <h1 style={styles.header}>DOM Analysis Report</h1>
      <div style={styles.metaInfo}>
        <p><strong>URL:</strong> <a href={url} target="_blank" rel="noopener noreferrer">{url}</a></p>
        <p><strong>Title:</strong> {title}</p>
        <p><strong>Timestamp:</strong> {new Date(timestamp).toLocaleString()}</p>
        <p><strong>Elements Found:</strong> {count}</p>
        <p><strong>IFrames Scanned:</strong> {scannedFrames}</p>
      </div>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>#</th>
            <th style={styles.th}>Label/Text</th>
            <th style={styles.th}>Tag</th>
            <th style={styles.th}>Visibility</th>
            <th style={styles.th}>Actions</th>
            <th style={styles.th}>Selectors</th>
            <th style={styles.th}>Details</th>
          </tr>
        </thead>
        <tbody>
          {elements.map((el: any, index: number) => (
            <tr key={index} style={index % 2 === 0 ? styles.tr : styles.trEven}>
              <td style={styles.td}>{index + 1}</td>
              <td style={styles.td}>{el.label || <i style={{ color: '#6c757d' }}>N/A</i>}</td>
              <td style={styles.td}><span style={styles.code}>{el.tag}</span></td>
              <td style={styles.td}><ReportValue value={el.visible} /></td>
              <td style={styles.td}><ReportValue value={el.actions} /></td>
              <td style={styles.td}>
                <div style={{ marginBottom: '5px' }}><strong>CSS:</strong> <code style={styles.code}>{el.css}</code></div>
                <div><strong>XPath:</strong> <code style={styles.code}>{el.xpath}</code></div>
              </td>
              <td style={styles.td}>
                {el.placeholder && <div><strong>Placeholder:</strong> {el.placeholder}</div>}
                {el.id && <div><strong>ID:</strong> {el.id}</div>}
                {el.aria && <div><strong>ARIA:</strong> <ReportValue value={el.aria} /></div>}
                {el.bbox && <div><strong>BBox:</strong> <ReportValue value={el.bbox} /></div>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<AnalysisReport />);
}
