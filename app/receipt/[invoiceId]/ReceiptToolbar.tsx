'use client';

interface Props {
  invoiceId: string;
}

export function ReceiptToolbar({ invoiceId }: Props) {
  return (
    <div
      className="no-print"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 12px',
        borderBottom: '1px solid #e0e0e0',
        background: '#fafafa',
      }}
    >
      <button
        type="button"
        onClick={() => window.print()}
        style={{
          padding: '5px 14px',
          border: '1px solid #bbb',
          borderRadius: '6px',
          background: '#fff',
          cursor: 'pointer',
          fontSize: '13px',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        Print
      </button>
      <span style={{ fontSize: '12px', color: '#888', fontFamily: 'monospace' }}>
        {invoiceId}
      </span>
    </div>
  );
}
